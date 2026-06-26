import { Prisma, type PrismaClient, type Sponsor } from '@prisma/client';

import { prisma as defaultClient } from './index.js';

// ---------------------------------------------------------------------------
// Sponsor CRUD (Phase 6). Mirrors the source/topic repository factory pattern so
// it can be injected with a fake client in DB-free unit tests.
// ---------------------------------------------------------------------------

export interface CreateSponsorData {
  name: string;
  websiteUrl: string;
  logoUrl?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  active?: boolean;
}

export interface UpdateSponsorData {
  name?: string;
  websiteUrl?: string;
  logoUrl?: string | null;
  contactEmail?: string | null;
  notes?: string | null;
  active?: boolean;
}

export interface SponsorRepository {
  findAll(): Promise<Sponsor[]>;
  /** Active sponsors only — the set offerable as a sponsored slot. */
  findActive(): Promise<Sponsor[]>;
  findById(id: string): Promise<Sponsor | null>;
  create(data: CreateSponsorData): Promise<Sponsor>;
  update(id: string, data: UpdateSponsorData): Promise<Sponsor>;
  /** Convenience for activate/deactivate toggles. */
  setActive(id: string, active: boolean): Promise<Sponsor>;
}

export function createSponsorRepository(client: PrismaClient = defaultClient): SponsorRepository {
  return {
    findAll(): Promise<Sponsor[]> {
      return client.sponsor.findMany({ orderBy: { name: 'asc' } });
    },

    findActive(): Promise<Sponsor[]> {
      return client.sponsor.findMany({ where: { active: true }, orderBy: { name: 'asc' } });
    },

    findById(id: string): Promise<Sponsor | null> {
      return client.sponsor.findUnique({ where: { id } });
    },

    create(data: CreateSponsorData): Promise<Sponsor> {
      return client.sponsor.create({ data: data as Prisma.SponsorCreateInput });
    },

    update(id: string, data: UpdateSponsorData): Promise<Sponsor> {
      return client.sponsor.update({ where: { id }, data: data as Prisma.SponsorUpdateInput });
    },

    setActive(id: string, active: boolean): Promise<Sponsor> {
      return client.sponsor.update({ where: { id }, data: { active } });
    },
  };
}
