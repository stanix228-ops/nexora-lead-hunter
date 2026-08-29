import { prisma } from '@nexora/database';
import type { ActivityAction, EntityType } from '@nexora/types';
import { emitToUser } from '../../common/realtime/socket';

export interface RecordActivityInput {
  userId: string;
  action: ActivityAction;
  entity: EntityType;
  entityId?: string | null;
  leadId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Record a significant user action (see Activity Log spec) and fan out. */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  await prisma.activityEvent.create({
    data: {
      userId: input.userId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      leadId: input.leadId ?? null,
      metadata: input.metadata ? (input.metadata as object) : undefined,
    },
  });
  emitToUser(input.userId, 'activity.recorded', {
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
  });
}