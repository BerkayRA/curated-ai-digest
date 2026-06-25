import { Prisma, type PrismaClient, type Source, type SourceType } from '@prisma/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateSourceData {
  /** Topic the source belongs to (required by the schema relation). */
  topicId: string;
  type: SourceType;
  label: string;
  url?: string | null;
  enabled?: boolean;
  /** Pass null to explicitly clear config; omit to leave unset. */
  config?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
}

export interface UpdateSourceData {
  topicId?: string;
  type?: SourceType;
  label?: string;
  url?: string | null;
  enabled?: boolean;
  /** Pass null to explicitly clear config; omit to leave unchanged. */
  config?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
}

export interface HealthData {
  lastRunAt: Date;
  lastStatus: 'ok' | 'error';
  lastCount: number;
  lastError?: string | null;
}

export interface SourceRepository {
  findAll(): Promise<Source[]>;
  findEnabled(): Promise<Source[]>;
  /** Enabled sources scoped to a single topic. */
  findEnabledByTopic(topicId: string): Promise<Source[]>;
  findById(id: string): Promise<Source | null>;
  create(data: CreateSourceData): Promise<Source>;
  update(id: string, data: UpdateSourceData): Promise<Source>;
  delete(id: string): Promise<Source>;
  recordHealth(id: string, health: HealthData): Promise<Source>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a `SourceRepository` bound to the given PrismaClient. Accepts any
 * compatible client so tests can inject a fake without a live database.
 */
export function createSourceRepository(client: PrismaClient): SourceRepository {
  return {
    findAll(): Promise<Source[]> {
      return client.source.findMany({});
    },

    findEnabled(): Promise<Source[]> {
      return client.source.findMany({ where: { enabled: true } });
    },

    findEnabledByTopic(topicId: string): Promise<Source[]> {
      return client.source.findMany({ where: { enabled: true, topicId } });
    },

    findById(id: string): Promise<Source | null> {
      return client.source.findUnique({ where: { id } });
    },

    create(data: CreateSourceData): Promise<Source> {
      return client.source.create({ data: data as Prisma.SourceUncheckedCreateInput });
    },

    update(id: string, data: UpdateSourceData): Promise<Source> {
      return client.source.update({
        where: { id },
        data: data as Prisma.SourceUncheckedUpdateInput,
      });
    },

    delete(id: string): Promise<Source> {
      return client.source.delete({ where: { id } });
    },

    recordHealth(id: string, health: HealthData): Promise<Source> {
      return client.source.update({
        where: { id },
        data: {
          lastRunAt: health.lastRunAt,
          lastStatus: health.lastStatus,
          lastCount: health.lastCount,
          lastError: health.lastError ?? null,
        },
      });
    },
  };
}
