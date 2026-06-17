/**
 * Dispatch service unit tests.
 * Uses injected mock provider + mock repo + mock transitionFn.
 * No real DB or email calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchIssue } from '../dispatch.js';
import type { DispatchRepo } from '../dispatch.js';
import type { EmailProvider, EmailMessage, SendResult } from '@mega-bulten/email';
import type { IssueStatus } from '@mega-bulten/shared';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockSettings = {
  id: 'settings-1',
  autoSendEnabled: false,
  sendDayOfWeek: 'Thursday',
  sendTime: '09:00',
  timezone: 'Europe/Istanbul',
  activeProvider: 'resend' as const,
  fromAddress: 'bulten@mega.com.tr',
  replyTo: null,
  pipelineLeadDays: 2,
  updatedAt: new Date(),
};

const mockSubscribers = [
  {
    id: 'sub-1',
    email: 'alice@example.com',
    displayName: 'Alice',
    company: null,
    status: 'active' as const,
    locale: 'tr-TR',
    unsubscribeToken: 'token-alice-abc123',
    source: 'manual',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'sub-2',
    email: 'bob@example.com',
    displayName: null,
    company: null,
    status: 'active' as const,
    locale: 'tr-TR',
    unsubscribeToken: 'token-bob-def456',
    source: 'import',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const mockIssue = {
  id: 'issue-1',
  isoWeek: '2026-W25',
  status: 'approved' as IssueStatus,
  subject: 'Test Bülten Konusu',
  preheader: 'Test ön izleme',
  bodyHtml: null,
  bodyJson: null,
  scheduledAt: null,
  sentAt: null,
  approvedById: null,
  autoSent: false,
  createdAt: new Date('2026-06-17'),
  updatedAt: new Date(),
  items: [
    {
      id: 'item-1',
      issueId: 'issue-1',
      candidateArticleId: null,
      order: 0,
      titleTr: 'Haber Başlığı 1',
      summaryTr: 'Haber özeti 1 — yeterince uzun bir içerik',
      sourceUrl: 'https://example.com/article-1',
      sourceName: 'Example Source',
      factCheckNotes: null,
      qaFlags: null,
    },
    {
      id: 'item-2',
      issueId: 'issue-1',
      candidateArticleId: null,
      order: 1,
      titleTr: 'Haber Başlığı 2',
      summaryTr: 'Haber özeti 2 — başka bir içerik',
      sourceUrl: 'https://example.com/article-2',
      sourceName: 'Another Source',
      factCheckNotes: null,
      qaFlags: null,
    },
  ],
};

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function makeMockRepo(overrides: Partial<DispatchRepo> = {}): DispatchRepo {
  return {
    getIssueWithItems: vi.fn().mockResolvedValue(mockIssue),
    getActiveSubscribers: vi.fn().mockResolvedValue(mockSubscribers),
    getSettings: vi.fn().mockResolvedValue(mockSettings),
    recordSend: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeMockProvider(overrides: Partial<EmailProvider> = {}): EmailProvider {
  const sendResults: SendResult[] = mockSubscribers.map((_, i) => ({
    providerMessageId: `msg-${i + 1}`,
    status: 'sent' as const,
  }));

  return {
    kind: 'resend' as const,
    send: vi.fn().mockResolvedValue(sendResults[0]!),
    sendBatch: vi.fn().mockResolvedValue(sendResults),
    verifyConfig: vi.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
}

const mockTransitionFn = vi.fn().mockResolvedValue({ id: 'issue-1', status: 'sent' });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dispatchIssue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransitionFn.mockResolvedValue({ id: 'issue-1', status: 'sent' });
  });

  it('sends to all active subscribers and records Send rows', async () => {
    const repo = makeMockRepo();
    const provider = makeMockProvider();

    const result = await dispatchIssue('issue-1', { provider, repo, transitionFn: mockTransitionFn });

    expect(result.totalRecipients).toBe(2);
    expect(result.successCount).toBe(2);
    expect(result.failureCount).toBe(0);
    expect(result.issueStatus).toBe('sent');
  });

  it('builds messages with correct unsubscribe URL and List-Unsubscribe header', async () => {
    const repo = makeMockRepo();
    const provider = makeMockProvider();

    await dispatchIssue('issue-1', { provider, repo, transitionFn: mockTransitionFn });

    const sendBatchMock = provider.sendBatch as ReturnType<typeof vi.fn>;
    const mockCall = sendBatchMock.mock.calls[0];
    expect(mockCall).toBeDefined();
    const messages: readonly EmailMessage[] = (mockCall as [readonly EmailMessage[]])[0];

    const aliceMsg = messages.find((m) => m.to.email === 'alice@example.com');
    expect(aliceMsg).toBeDefined();
    expect(aliceMsg!.headers?.['List-Unsubscribe']).toMatch(/token-alice-abc123/);
    expect(aliceMsg!.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(aliceMsg!.html).toBeTruthy();

    const bobMsg = messages.find((m) => m.to.email === 'bob@example.com');
    expect(bobMsg).toBeDefined();
    expect(bobMsg!.headers?.['List-Unsubscribe']).toMatch(/token-bob-def456/);
  });

  it('records a Send row for each subscriber', async () => {
    const repo = makeMockRepo();
    const provider = makeMockProvider();

    await dispatchIssue('issue-1', { provider, repo, transitionFn: mockTransitionFn });

    const recordSendMock = repo.recordSend as ReturnType<typeof vi.fn>;
    expect(recordSendMock).toHaveBeenCalledTimes(2);

    const calls: Array<Parameters<DispatchRepo['recordSend']>[0]> = recordSendMock.mock.calls.map(
      (c: unknown[]) => c[0] as Parameters<DispatchRepo['recordSend']>[0],
    );
    expect(calls.every((c) => c.status === 'sent')).toBe(true);
    expect(calls.map((c) => c.subscriberId).sort()).toEqual(['sub-1', 'sub-2'].sort());
    expect(calls.every((c) => c.providerMessageId !== undefined)).toBe(true);
  });

  it('calls transitionFn with to=sent on success', async () => {
    const repo = makeMockRepo();
    const provider = makeMockProvider();

    await dispatchIssue('issue-1', { provider, repo, transitionFn: mockTransitionFn });

    expect(mockTransitionFn).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: 'issue-1', to: 'sent' }),
    );
  });

  it('transitions to failed and records error Send rows when provider throws', async () => {
    const repo = makeMockRepo();
    const provider = makeMockProvider({
      sendBatch: vi.fn().mockRejectedValue(new Error('Provider down')),
    });

    mockTransitionFn.mockResolvedValueOnce({ id: 'issue-1', status: 'failed' });

    const result = await dispatchIssue('issue-1', { provider, repo, transitionFn: mockTransitionFn });

    expect(result.issueStatus).toBe('failed');
    expect(result.failureCount).toBe(2);
    expect(result.successCount).toBe(0);

    const recordSendMock = repo.recordSend as ReturnType<typeof vi.fn>;
    const calls: Array<Parameters<DispatchRepo['recordSend']>[0]> = recordSendMock.mock.calls.map(
      (c: unknown[]) => c[0] as Parameters<DispatchRepo['recordSend']>[0],
    );
    expect(calls.every((c) => c.status === 'failed')).toBe(true);
    expect(calls.every((c) => c.error !== undefined)).toBe(true);
  });

  it('throws when provider verifyConfig returns not ok', async () => {
    const repo = makeMockRepo();
    const provider = makeMockProvider({
      verifyConfig: vi.fn().mockResolvedValue({ ok: false, detail: 'API key missing' }),
    });

    await expect(
      dispatchIssue('issue-1', { provider, repo, transitionFn: mockTransitionFn }),
    ).rejects.toThrow(/API key missing/);
  });

  it('throws when no settings row exists', async () => {
    const repo = makeMockRepo({ getSettings: vi.fn().mockResolvedValue(null) });
    const provider = makeMockProvider();

    await expect(
      dispatchIssue('issue-1', { provider, repo, transitionFn: mockTransitionFn }),
    ).rejects.toThrow(/settings/i);
  });

  it('throws when issue is not found', async () => {
    const repo = makeMockRepo({ getIssueWithItems: vi.fn().mockResolvedValue(null) });
    const provider = makeMockProvider();

    await expect(
      dispatchIssue('issue-1', { provider, repo, transitionFn: mockTransitionFn }),
    ).rejects.toThrow(/not found/i);
  });

  it('throws when there are no active subscribers', async () => {
    const repo = makeMockRepo({ getActiveSubscribers: vi.fn().mockResolvedValue([]) });
    const provider = makeMockProvider();

    await expect(
      dispatchIssue('issue-1', { provider, repo, transitionFn: mockTransitionFn }),
    ).rejects.toThrow(/subscriber/i);
  });

  it('sets correct from address from settings', async () => {
    const repo = makeMockRepo();
    const provider = makeMockProvider();

    await dispatchIssue('issue-1', { provider, repo, transitionFn: mockTransitionFn });

    const sendBatchMock = provider.sendBatch as ReturnType<typeof vi.fn>;
    const mockCall = sendBatchMock.mock.calls[0];
    expect(mockCall).toBeDefined();
    const messages: readonly EmailMessage[] = (mockCall as [readonly EmailMessage[]])[0];

    expect(messages[0]!.from.email).toBe('bulten@mega.com.tr');
  });
});
