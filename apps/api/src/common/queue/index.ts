import { env } from '../../config/env';
import { logger } from '../logger';

/**
 * Background job abstraction.
 *
 * - REDIS_URL set  → BullMQ (durable, distributed via Redis).
 * - otherwise      → in-process memory queue (single-process dev mode).
 *
 * This layer is for application bookkeeping (imports, analytics
 * aggregation) — never for anything that would circumvent platform
 * limits of WhatsApp.
 */

export interface JobHandler<T = Record<string, unknown>> {
  (data: T): Promise<void>;
}

export interface JobQueue<T = Record<string, unknown>> {
  add(name: string, data: T): Promise<void>;
  process(name: string, handler: JobHandler<T>): void;
  close(): Promise<void>;
}

/* ------------------------------------------------------- memory */
class MemoryQueue<T extends Record<string, unknown>> implements JobQueue<T> {
  private handlers = new Map<string, JobHandler<T>>();
  private pending: Array<{ name: string; data: T }> = [];
  private running = false;

  async add(name: string, data: T) {
    this.pending.push({ name, data });
    this.drain();
  }

  process(name: string, handler: JobHandler<T>) {
    this.handlers.set(name, handler);
  }

  private drain() {
    if (this.running) return;
    this.running = true;
    const loop = async () => {
      while (this.pending.length > 0) {
        const job = this.pending.shift()!;
        const handler = this.handlers.get(job.name);
        if (handler) {
          try {
            await handler(job.data);
          } catch (err) {
            logger.warn('memory job failed', { name: job.name, error: (err as Error).message });
          }
        }
      }
      this.running = false;
    };
    void loop();
  }

  async close() {
    this.pending = [];
  }
}

/* ------------------------------------------------------- bullmq */
interface BullLike {
  Queue: new (name: string, opts: { connection: unknown }) => {
    add(name: string, data: unknown): Promise<void>;
    close(): Promise<void>;
  };
  Worker: new (
    name: string,
    handler: (job: { name: string; data: unknown }) => Promise<void>,
    opts: { connection: unknown },
  ) => { close(): Promise<void> };
}

class RedisQueue<T extends Record<string, unknown>> implements JobQueue<T> {
  private queue: InstanceType<BullLike['Queue']>;
  private workers: Array<{ close(): Promise<void> }> = [];

  constructor(private connection: unknown) {
    // lazily import BullMQ — only reachable when Redis is configured
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Queue } = require('bullmq') as BullLike;
    this.queue = new Queue('nexora', { connection: this.connection });
  }

  async add(name: string, data: T) {
    await this.queue.add(name, data);
  }

  process(name: string, handler: JobHandler<T>) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Worker } = require('bullmq') as BullLike;
    const worker = new Worker(
      'nexora',
      async (job) => {
        if (job.name === name) await handler(job.data as T);
      },
      { connection: this.connection },
    );
    this.workers.push(worker);
  }

  async close() {
    for (const w of this.workers) await w.close();
    await this.queue.close();
  }
}

/* ------------------------------------------------------- provider */
let singleton: JobQueue | null = null;

export async function getQueue(): Promise<JobQueue> {
  if (singleton) return singleton;
  if (env.REDIS_URL) {
    const mod = (await import('ioredis')) as unknown as {
      default?: new (url: string, opts?: unknown) => unknown;
      IORedis?: new (url: string, opts?: unknown) => unknown;
    };
    const IORedis = mod.default ?? mod.IORedis;
    const connection = new IORedis!(env.REDIS_URL, { maxRetriesPerRequest: null });
    singleton = new RedisQueue(connection);
    logger.info('Queue: BullMQ + Redis');
  } else {
    singleton = new MemoryQueue();
    logger.info('Queue: in-memory fallback (REDIS_URL not set)');
  }
  return singleton;
}