import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock @microsoft/microsoft-graph-client
// The vi.mock factory is hoisted to the top of the file by vitest, so we MUST
// NOT reference any variables declared in this file inside the factory.
// Instead, we use vi.fn() directly and capture the mock references afterwards.
// ---------------------------------------------------------------------------

vi.mock('@microsoft/microsoft-graph-client', () => {
  const mockPost = vi.fn();
  const mockApi = vi.fn().mockReturnValue({ post: mockPost });
  return {
    Client: {
      initWithMiddleware: vi.fn().mockReturnValue({ api: mockApi }),
    },
  };
});

vi.mock('@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js', () => ({
  TokenCredentialAuthenticationProvider: vi.fn(function () { return {}; }),
}));

vi.mock('@azure/identity', () => ({
  ClientSecretCredential: vi.fn(function () { return {}; }),
  DefaultAzureCredential: vi.fn(function () { return {}; }),
}));

// Import after mocks are set up
import { Client } from '@microsoft/microsoft-graph-client';
import { GraphEmailProvider } from '../../providers/graph';
import type { EmailMessage } from '../../providers/provider';

// ---------------------------------------------------------------------------
// Helpers to access the mocked internals at call time
// ---------------------------------------------------------------------------

function getMockApi() {
  // The mock instance returned by Client.initWithMiddleware
  const clientInstance = (
    Client.initWithMiddleware as ReturnType<typeof vi.fn>
  ).mock.results.at(-1)?.value as { api: ReturnType<typeof vi.fn> } | undefined;
  return clientInstance?.api;
}

function getMockPost() {
  const api = getMockApi();
  if (!api) return undefined;
  const apiResult = (api as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value as
    | { post: ReturnType<typeof vi.fn> }
    | undefined;
  return apiResult?.post;
}

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const cfg = {
  tenantId: 'tenant-abc',
  clientId: 'client-abc',
  clientSecret: 'secret-abc',
  senderId: 'digest@mega.com.tr',
};

const msg: EmailMessage = {
  to: { email: 'subscriber@example.com', name: 'Test User' },
  from: { email: 'digest@mega.com.tr', name: 'Curated AI Digest' },
  subject: 'Weekly digest',
  html: '<p>Content</p>',
  text: 'Content',
  headers: {
    'List-Unsubscribe': '<https://example.com/unsub/token>',
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GraphEmailProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Re-wire the mock chain after clearAllMocks resets call history.
    // We need api() to return an object with a post() fn.
    const mockPost = vi.fn().mockResolvedValue(undefined);
    const mockApiInstance = { post: mockPost };
    (Client.initWithMiddleware as ReturnType<typeof vi.fn>).mockReturnValue({
      api: vi.fn().mockReturnValue(mockApiInstance),
    });
  });

  describe('verifyConfig', () => {
    it('returns ok:false when all Graph env vars are missing', async () => {
      const provider = new GraphEmailProvider({ config: {} });
      const result = await provider.verifyConfig();
      expect(result.ok).toBe(false);
      expect(result.detail).toContain('GRAPH_TENANT_ID');
      expect(result.detail).toContain('GRAPH_CLIENT_ID');
      expect(result.detail).toContain('GRAPH_CLIENT_SECRET');
      expect(result.detail).toContain('GRAPH_SENDER_ID');
    });

    it('returns ok:false and mentions each missing var individually', async () => {
      const provider = new GraphEmailProvider({
        config: { tenantId: 't', clientId: 'c', clientSecret: 's' }, // senderId missing
      });
      const result = await provider.verifyConfig();
      expect(result.ok).toBe(false);
      expect(result.detail).toContain('GRAPH_SENDER_ID');
      expect(result.detail).not.toContain('GRAPH_TENANT_ID');
    });

    it('returns ok:true when all required vars are present', async () => {
      const provider = new GraphEmailProvider({ config: cfg });
      const result = await provider.verifyConfig();
      expect(result.ok).toBe(true);
    });
  });

  describe('send', () => {
    it('calls /users/{senderId}/sendMail and returns queued status', async () => {
      const provider = new GraphEmailProvider({ config: cfg });
      const result = await provider.send(msg);

      const mockApi = getMockApi();
      expect(mockApi).toHaveBeenCalledWith(`/users/${cfg.senderId}/sendMail`);

      const mockPost = getMockPost();
      expect(mockPost).toHaveBeenCalledTimes(1);

      expect(result.status).toBe('queued');
      expect(result.providerMessageId).toContain('graph:');
    });

    it('maps the message subject correctly', async () => {
      const provider = new GraphEmailProvider({ config: cfg });
      await provider.send(msg);

      const mockPost = getMockPost();
      const payload = mockPost?.mock.calls[0]?.[0] as { message: { subject: string } };
      expect(payload.message.subject).toBe('Weekly digest');
    });

    it('throws when the Graph API call rejects', async () => {
      // Override the post mock on the next client instance to throw.
      const throwingPost = vi.fn().mockRejectedValue(
        Object.assign(new Error('Graph error'), { statusCode: 403 }),
      );
      (Client.initWithMiddleware as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        api: vi.fn().mockReturnValue({ post: throwingPost }),
      });

      const provider = new GraphEmailProvider({ config: cfg });
      await expect(provider.send(msg)).rejects.toThrow('Graph error');
    });
  });

  describe('sendBatch', () => {
    it('sends all messages and returns matching results', async () => {
      const provider = new GraphEmailProvider({
        config: cfg,
        concurrency: 2,
        perMinute: 0,
      });
      const msgs: EmailMessage[] = Array.from({ length: 4 }, (_, i) => ({
        ...msg,
        to: { email: `user${i}@example.com` },
      }));
      const results = await provider.sendBatch(msgs);
      expect(results).toHaveLength(4);
      expect(results.every((r) => r.status === 'queued')).toBe(true);
    });
  });
});
