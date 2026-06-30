import { describe, it, expect } from 'vitest';
import { UpdateSettingsSchema } from '../settings';

describe('UpdateSettingsSchema', () => {
  it('accepts a valid full update', () => {
    const result = UpdateSettingsSchema.parse({
      autoSendEnabled: true,
      sendDayOfWeek: 'Thursday',
      sendTime: '09:00',
      timezone: 'Europe/Istanbul',
      activeProvider: 'acs_email',
      fromAddress: 'digest@example.com',
      replyTo: 'reply@example.com',
      pipelineLeadDays: 2,
    });
    expect(result.autoSendEnabled).toBe(true);
    expect(result.fromAddress).toBe('digest@example.com');
  });

  it('accepts an empty object (all fields optional)', () => {
    expect(() => UpdateSettingsSchema.parse({})).not.toThrow();
  });

  it('rejects an invalid sendDayOfWeek', () => {
    expect(() => UpdateSettingsSchema.parse({ sendDayOfWeek: 'Cuma' })).toThrow();
  });

  it('rejects an invalid sendTime format', () => {
    expect(() => UpdateSettingsSchema.parse({ sendTime: '9:00' })).toThrow();
  });

  it('rejects an invalid activeProvider', () => {
    expect(() => UpdateSettingsSchema.parse({ activeProvider: 'mailgun' })).toThrow();
  });

  it('rejects pipelineLeadDays exceeding 14', () => {
    expect(() => UpdateSettingsSchema.parse({ pipelineLeadDays: 15 })).toThrow();
  });

  it('rejects a negative pipelineLeadDays', () => {
    expect(() => UpdateSettingsSchema.parse({ pipelineLeadDays: -1 })).toThrow();
  });

  it('lowercases fromAddress via emailSchema', () => {
    const result = UpdateSettingsSchema.parse({ fromAddress: 'DIGEST@EXAMPLE.COM' });
    expect(result.fromAddress).toBe('digest@example.com');
  });
});
