import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock resend SDK
// ---------------------------------------------------------------------------

const mockEmailsSend = vi.fn();

vi.mock('resend', () => ({
  // Vitest 4 constructs mock impls via Reflect.construct; arrow fns aren't
  // constructable, so use a regular function (returns the instance shape).
  Resend: vi.fn(function () {
    return { emails: { send: mockEmailsSend } };
  }),
}));

import { ResendEmailProvider } from '../../providers/resend';
import type { EmailMessage } from '../../providers/provider';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const msg: EmailMessage = {
  to: { email: 'subscriber@example.com', name: 'Test User' },
  from: { email: 'digest@mega.com.tr', name: 'Curated AI Digest' },
  subject: 'Haftalık özet',
  html: '<p>İçerik</p>',
  text: 'İçerik',
  headers: {
    'List-Unsubscribe': '<https://example.com/unsub/token>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
};

const successResponse = { data: { id: 'resend-msg-001' }, error: null };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ResendEmailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmailsSend.mockResolvedValue(successResponse);
  });

  describe('verifyConfig', () => {
    it('returns ok:false with detail when RESEND_API_KEY is missing', async () => {
      const provider = new ResendEmailProvider({ config: {} });
      const result = await provider.verifyConfig();
      expect(result.ok).toBe(false);
      expect(result.detail).toContain('RESEND_API_KEY');
    });

    it('returns ok:true when RESEND_API_KEY is present', async () => {
      const provider = new ResendEmailProvider({ config: { apiKey: 're_test_key' } });
      const result = await provider.verifyConfig();
      expect(result.ok).toBe(true);
    });
  });

  describe('send', () => {
    it('returns a SendResult with queued status and the resend message id', async () => {
      const provider = new ResendEmailProvider({ config: { apiKey: 're_test' } });
      const result = await provider.send(msg);
      expect(result.providerMessageId).toBe('resend-msg-001');
      expect(result.status).toBe('queued');
    });

    it('throws when the Resend API returns an error', async () => {
      mockEmailsSend.mockResolvedValue({
        data: null,
        error: { name: 'validation_error', message: 'Invalid from address' },
      });
      const provider = new ResendEmailProvider({ config: { apiKey: 're_test' } });
      await expect(provider.send(msg)).rejects.toThrow('Invalid from address');
    });

    it('forwards List-Unsubscribe headers to the SDK', async () => {
      const provider = new ResendEmailProvider({ config: { apiKey: 're_test' } });
      await provider.send(msg);
      const payload = mockEmailsSend.mock.calls[0]?.[0] as { headers: Record<string, string> };
      expect(payload.headers['List-Unsubscribe']).toBe('<https://example.com/unsub/token>');
      expect(payload.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    });

    it('formats the from address as "Name <email>" when a name is provided', async () => {
      const provider = new ResendEmailProvider({ config: { apiKey: 're_test' } });
      await provider.send(msg);
      const payload = mockEmailsSend.mock.calls[0]?.[0] as { from: string };
      expect(payload.from).toBe('Curated AI Digest <digest@mega.com.tr>');
    });
  });

  describe('sendBatch', () => {
    it('returns results for all messages', async () => {
      const provider = new ResendEmailProvider({
        config: { apiKey: 're_test' },
        concurrency: 3,
        perMinute: 0,
      });
      const msgs: EmailMessage[] = Array.from({ length: 5 }, (_, i) => ({
        ...msg,
        to: { email: `user${i}@example.com` },
      }));
      const results = await provider.sendBatch(msgs);
      expect(results).toHaveLength(5);
      expect(mockEmailsSend).toHaveBeenCalledTimes(5);
    });
  });
});
