import { prisma } from '@nexora/database';
import { logger } from '../../common/logger';
import { emitToUser } from '../../common/realtime/socket';
import { LeadHunterService } from './hunter.service';

interface RunningTask {
  jobId: string;
  userId: string;
  cancelled: boolean;
  paused: boolean;
}

/**
 * Lead Hunter Queue Manager
 * Manages background task execution, concurrency, and real-time event broadcasting.
 */
class LeadHunterQueueManager {
  private runningJobs = new Map<string, RunningTask>();
  private maxConcurrent = 2;
  private isProcessing = false;

  constructor() {
    // Check pending jobs on server start
    setTimeout(() => {
      void this.processNext();
    }, 3000);
  }

  /**
   * Enqueue a new Lead Hunter job.
   */
  async enqueue(jobId: string, userId: string): Promise<void> {
    logger.info('Hunter Queue: Enqueuing job', { jobId, userId });

    await prisma.leadHunterJob.update({
      where: { id: jobId },
      data: { status: 'PENDING' },
    });

    emitToUser(userId, 'hunter.job_created', { jobId });
    void this.processNext();
  }

  /**
   * Pause a running or pending job.
   */
  async pause(jobId: string, userId: string): Promise<boolean> {
    const running = this.runningJobs.get(jobId);
    if (running) {
      running.paused = true;
    }

    await prisma.leadHunterJob.update({
      where: { id: jobId, userId },
      data: { status: 'PAUSED' },
    });

    emitToUser(userId, 'hunter.job_paused', { jobId });
    return true;
  }

  /**
   * Resume a paused job.
   */
  async resume(jobId: string, userId: string): Promise<boolean> {
    const running = this.runningJobs.get(jobId);
    if (running) {
      running.paused = false;
    }

    await prisma.leadHunterJob.update({
      where: { id: jobId, userId },
      data: { status: 'PENDING' },
    });

    emitToUser(userId, 'hunter.job_resumed', { jobId });
    void this.processNext();
    return true;
  }

  /**
   * Cancel a running or pending job.
   */
  async cancel(jobId: string, userId: string): Promise<boolean> {
    const running = this.runningJobs.get(jobId);
    if (running) {
      running.cancelled = true;
      this.runningJobs.delete(jobId);
    }

    await prisma.leadHunterJob.update({
      where: { id: jobId, userId },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });

    emitToUser(userId, 'hunter.job_cancelled', { jobId });
    return true;
  }

  /**
   * Process next pending job from database if slots available.
   */
  async processNext(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      if (this.runningJobs.size >= this.maxConcurrent) {
        return;
      }

      const pendingJob = await prisma.leadHunterJob.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
      });

      if (!pendingJob) {
        return;
      }

      const task: RunningTask = {
        jobId: pendingJob.id,
        userId: pendingJob.userId,
        cancelled: false,
        paused: false,
      };

      this.runningJobs.set(pendingJob.id, task);

      // Execute asynchronously
      void this.executeJob(task);
    } catch (err) {
      logger.error('Hunter Queue error in processNext', { error: (err as Error).message });
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeJob(task: RunningTask): Promise<void> {
    try {
      await LeadHunterService.runJob(task.jobId, (progress) => {
        if (task.cancelled || task.paused) return;
        emitToUser(task.userId, 'hunter.job_progress', {
          jobId: task.jobId,
          ...progress,
        });
      });

      emitToUser(task.userId, 'hunter.job_completed', { jobId: task.jobId });
    } catch (err) {
      logger.error('Hunter Queue: Job execution failed', { jobId: task.jobId, error: (err as Error).message });
      await prisma.leadHunterJob.update({
        where: { id: task.jobId },
        data: {
          status: 'FAILED',
          errorMessage: (err as Error).message,
          completedAt: new Date(),
        },
      }).catch(() => {});

      emitToUser(task.userId, 'hunter.job_failed', { jobId: task.jobId, error: (err as Error).message });
    } finally {
      this.runningJobs.delete(task.jobId);
      // Pick next job
      void this.processNext();
    }
  }
}

export const hunterQueue = new LeadHunterQueueManager();
