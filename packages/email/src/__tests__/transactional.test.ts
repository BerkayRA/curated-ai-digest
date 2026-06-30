import { describe, it, expect, vi } from 'vitest';
import { renderConfirmEmail, sendTransactionalEmail } from '../transactional';
import type { EmailMessage, EmailProvider, SendResult } from '../providers/provider';

const CONFIRM_URL = 'https://digest.megabilgisayar.com.tr/confirm/tok-123';

describe('renderConfirmEmail', () => {
  it('returns non-empty html and text', async () => {
    const { html, text } = await renderConfirmEmail({
      topicName: 'Kurumsal YZ',
      confirmUrl: CONFIRM_URL,
      senderAddress: 'Mega Bilgisayar Tic. Ltd. Şti',
    });
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });

  it('embeds the confirm URL and topic name', async () => {
    const { html } = await renderConfirmEmail({
      topicName: 'Kurumsal YZ',
      confirmUrl: CONFIRM_URL,
      senderAddress: 'Mega Bilgisayar Tic. Ltd. Şti',
    });
    expect(html).toContain(CONFIRM_URL);
    expect(html).toContain('Kurumsal YZ');
    // Brand logo asset is referenced by absolute URL.
    expect(html).toContain('/brand/mega-logo-white.png');
  });

  it('includes the KVKK transparency note', async () => {
    const { html } = await renderConfirmEmail({
      topicName: 'Kurumsal YZ',
      confirmUrl: CONFIRM_URL,
      senderAddress: 'Mega Bilgisayar Tic. Ltd. Şti',
    });
    expect(html).toContain('KVKK');
  });
});

describe('sendTransactionalEmail', () => {
  const message: EmailMessage = {
    to: { email: 'someone@example.com' },
    from: { email: 'digest@example.com' },
    subject: 'Onay',
    html: '<p>hi</p>',
    text: 'hi',
  };

  const okResult: SendResult = { providerMessageId: 'msg-1', status: 'sent' };

  function makeProvider(overrides: Partial<EmailProvider> = {}): EmailProvider {
    return {
      kind: 'acs_email',
      verifyConfig: vi.fn(async () => ({ ok: true })),
      send: vi.fn(async () => okResult),
      sendBatch: vi.fn(async () => [okResult]),
      ...overrides,
    };
  }

  it('verifies config then sends and returns the provider result', async () => {
    const provider = makeProvider();
    const result = await sendTransactionalEmail(provider, message);
    expect(provider.verifyConfig).toHaveBeenCalledOnce();
    expect(provider.send).toHaveBeenCalledWith(message);
    expect(result).toEqual(okResult);
  });

  it('throws a descriptive error when the provider is not configured', async () => {
    const provider = makeProvider({
      verifyConfig: vi.fn(async () => ({ ok: false, detail: 'eksik ACS bağlantısı' })),
      send: vi.fn(async () => okResult),
    });
    await expect(sendTransactionalEmail(provider, message)).rejects.toThrow(
      /yapılandırılmamış/,
    );
    expect(provider.send).not.toHaveBeenCalled();
  });
});
