import { describe, it, expect, vi } from 'vitest';
import { createSponsorRepository } from '../sponsor-repository';

type MockFn = ReturnType<typeof vi.fn>;

interface FakeSponsorDelegate {
  findMany: MockFn;
  findUnique: MockFn;
  create: MockFn;
  update: MockFn;
}

function makeFakePrisma(overrides: Partial<FakeSponsorDelegate> = {}) {
  const sponsor: FakeSponsorDelegate = {
    findMany: vi.fn().mockResolvedValue([]),
    findUnique: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: 'sp-1' }),
    update: vi.fn().mockResolvedValue({ id: 'sp-1' }),
    ...overrides,
  };
  return { sponsor } as unknown as import('@prisma/client').PrismaClient;
}

describe('SponsorRepository', () => {
  it('findAll lists sponsors ordered by name', async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 'sp-1', name: 'Acme' }]);
    const repo = createSponsorRepository(makeFakePrisma({ findMany }));
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith({ orderBy: { name: 'asc' } });
  });

  it('findActive filters to active=true', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = createSponsorRepository(makeFakePrisma({ findMany }));
    await repo.findActive();
    expect(findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { name: 'asc' } });
  });

  it('findById queries by unique id', async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: 'sp-9' });
    const repo = createSponsorRepository(makeFakePrisma({ findUnique }));
    const found = await repo.findById('sp-9');
    expect(found).toEqual({ id: 'sp-9' });
    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'sp-9' } });
  });

  it('create passes the data through', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'sp-new' });
    const repo = createSponsorRepository(makeFakePrisma({ create }));
    await repo.create({ name: 'Acme', websiteUrl: 'https://acme.example.com' });
    expect(create).toHaveBeenCalledWith({
      data: { name: 'Acme', websiteUrl: 'https://acme.example.com' },
    });
  });

  it('setActive toggles the active flag', async () => {
    const update = vi.fn().mockResolvedValue({ id: 'sp-1', active: false });
    const repo = createSponsorRepository(makeFakePrisma({ update }));
    await repo.setActive('sp-1', false);
    expect(update).toHaveBeenCalledWith({ where: { id: 'sp-1' }, data: { active: false } });
  });
});
