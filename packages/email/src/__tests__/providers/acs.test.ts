import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @azure/communication-email before importing the provider
// ---------------------------------------------------------------------------

const mockPollUntilDone = vi.fn();
const mockBeginSend = vi.fn();

vi.mock('@azure/communication-email', () => ({
  // Vitest 4 constructs mock impls via Reflect.construct — use a regular
  // (constructable) function rather than an arrow.
  EmailClient: vi.fn(function () {
    return { beginSend: mockBeginSend };
  }),
  KnownEmailSendStatus: {
    NotStarted: 'NotStarted',
    Running: 'Running',
    Succeeded: 'Succeeded',
    Failed: 'Failed',
    Cancelled: 'Cancelled',
  },
}));

// Mock @azure/identity so DefaultAzureCredential doesn't try to auth
vi.mock('@azure/identity', () => ({
  DefaultAzureCredential: vi.fn(function () { return {}; }),
  ClientSecretCredential: vi.fn(function () { return {}; }),
}));

import { AcsEmailProvider } from '../../providers/acs.js';
import type { EmailMessage } from '../../providers/provider.js';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const msg: EmailMessage = {
  to: { email: 'subscriber@example.com', name: 'Test User' },
  from: { email: 'digest@mega.com.tr', name: 'Curated AI Digest' },
  subject: 'Test subject',
  html: '<p>Hello</p>',
  text: 'Hello',
  headers: {
    'List-Unsubscribe': '<https://example.com/unsub/token>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
};

const succeededResult = { id: 'msg-001', status: 'Succeeded', error: undefined };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AcsEmailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPollUntilDone.mockResolvedValue(succeededResult);
    mockBeginSend.mockResolvedValue({ pollUntilDone: mockPollUntilDone });
  });

  describe('verifyConfig', () => {
    it('returns ok:false with detail when ACS_SENDER_ADDRESS is missing', async () => {
      const provider = new AcsEmailProvider({ config: { connectionString: 'conn', senderAddress: undefined } });
      const result = await provider.verifyConfig();
      expect(result.ok).toBe(false);
      expect(result.detail).toContain('ACS_SENDER_ADDRESS');
    });

    it('returns ok:false with detail when both connection string and endpoint are missing', async () => {
      const provider = new AcsEmailProvider({ config: { senderAddress: 'digest@test.com' } });
      const result = await provider.verifyConfig();
      expect(result.ok).toBe(false);
      expect(result.detail).toContain('ACS_CONNECTION_STRING');
    });

    it('returns ok:true when connection string + sender address are present', async () => {
      const provider = new AcsEmailProvider({
        config: { connectionString: 'endpoint=https://test.com;accesskey=x', senderAddress: 'digest@test.com' },
      });
      const result = await provider.verifyConfig();
      expect(result.ok).toBe(true);
    });

    it('returns ok:true when endpoint + sender address are present', async () => {
      const provider = new AcsEmailProvider({
        config: { endpoint: 'https://test.communication.azure.com', senderAddress: 'digest@test.com' },
      });
      const result = await provider.verifyConfig();
      expect(result.ok).toBe(true);
    });
  });

  describe('send', () => {
    it('maps a Succeeded result to SendResult with status "sent"', async () => {
      const provider = new AcsEmailProvider({
        config: { connectionString: 'conn', senderAddress: 'from@test.com' },
      });
      const result = await provider.send(msg);
      expect(result.providerMessageId).toBe('msg-001');
      expect(result.status).toBe('sent');
    });

    it('throws when the ACS operation status is Failed', async () => {
      mockPollUntilDone.mockResolvedValue({
        id: 'msg-002',
        status: 'Failed',
        error: { message: 'Delivery failed' },
      });
      const provider = new AcsEmailProvider({
        config: { connectionString: 'conn', senderAddress: 'from@test.com' },
      });
      await expect(provider.send(msg)).rejects.toThrow('Delivery failed');
    });

    it('forwards List-Unsubscribe headers to beginSend', async () => {
      const provider = new AcsEmailProvider({
        config: { connectionString: 'conn', senderAddress: 'from@test.com' },
      });
      await provider.send(msg);
      const acsMsg = mockBeginSend.mock.calls[0]?.[0] as Record<string, unknown>;
      const headers = acsMsg['headers'] as Record<string, string>;
      expect(headers['List-Unsubscribe']).toBe('<https://example.com/unsub/token>');
      expect(headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    });
  });

  describe('sendBatch', () => {
    it('returns results for all messages', async () => {
      const provider = new AcsEmailProvider({
        config: { connectionString: 'conn', senderAddress: 'from@test.com' },
        concurrency: 2,
        perMinute: 0, // disable per-minute cap for speed
      });
      const msgs: EmailMessage[] = [
        { ...msg, to: { email: 'a@example.com' } },
        { ...msg, to: { email: 'b@example.com' } },
        { ...msg, to: { email: 'c@example.com' } },
      ];
      const results = await provider.sendBatch(msgs);
      expect(results).toHaveLength(3);
      for (const r of results) {
        expect(r.status).toBe('sent');
      }
    });

    it('respects concurrency — never exceeds the limit', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      mockBeginSend.mockImplementation(async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        concurrent--;
        return { pollUntilDone: async () => succeededResult };
      });

      const provider = new AcsEmailProvider({
        config: { connectionString: 'conn', senderAddress: 'from@test.com' },
        concurrency: 2,
        perMinute: 0,
      });

      const msgs = Array.from({ length: 6 }, (_, i) => ({
        ...msg,
        to: { email: `user${i}@example.com` },
      }));

      await provider.sendBatch(msgs);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });
});
