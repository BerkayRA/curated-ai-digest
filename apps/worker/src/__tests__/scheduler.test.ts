/**
 * settingsToCronExpressions — unit tests for the cron derivation helper.
 */

import { describe, it, expect } from 'vitest';
import { settingsToCronExpressions } from '../scheduler.js';
import type { SchedulerSettings } from '../scheduler.js';

function settings(overrides: Partial<SchedulerSettings> = {}): SchedulerSettings {
  return {
    sendDayOfWeek: 'Thursday',
    sendTime: '09:00',
    pipelineLeadDays: 2,
    ...overrides,
  };
}

describe('settingsToCronExpressions', () => {
  it('produces the correct send cron for Thursday 09:00', () => {
    const { send } = settingsToCronExpressions(settings());
    // Thursday = 4, 09:00
    expect(send).toBe('0 9 * * 4');
  });

  it('produces the curation cron 2 days before Thursday (Tuesday = 2)', () => {
    const { curation } = settingsToCronExpressions(settings());
    // Tuesday = 2, curation at 05:00
    expect(curation).toBe('0 5 * * 2');
  });

  it('handles Monday sendDay with 1 lead day → curation on Sunday (0)', () => {
    const { send, curation } = settingsToCronExpressions(
      settings({ sendDayOfWeek: 'Monday', pipelineLeadDays: 1 }),
    );
    expect(send).toBe('0 9 * * 1');
    expect(curation).toBe('0 5 * * 0');
  });

  it('handles Sunday sendDay with 2 lead days → curation wraps to Friday (5)', () => {
    const { curation } = settingsToCronExpressions(
      settings({ sendDayOfWeek: 'Sunday', sendTime: '08:30', pipelineLeadDays: 2 }),
    );
    // Sunday = 0, 0 - 2 = -2, mod 7 = 5 (Friday)
    expect(curation).toBe('0 5 * * 5');
  });

  it('handles 0 lead days → curation on same day as send', () => {
    const { curation, send } = settingsToCronExpressions(
      settings({ sendDayOfWeek: 'Wednesday', pipelineLeadDays: 0 }),
    );
    // Both on Wednesday (3)
    expect(curation).toBe('0 5 * * 3');
    expect(send).toBe('0 9 * * 3');
  });

  it('parses sendTime minutes correctly for 14:30', () => {
    const { send } = settingsToCronExpressions(
      settings({ sendDayOfWeek: 'Friday', sendTime: '14:30' }),
    );
    // Friday = 5, 14:30
    expect(send).toBe('30 14 * * 5');
  });

  it('handles full week wrap: Saturday sendDay with 3 lead days → Wednesday (3)', () => {
    const { curation } = settingsToCronExpressions(
      settings({ sendDayOfWeek: 'Saturday', pipelineLeadDays: 3 }),
    );
    // Saturday = 6, 6 - 3 = 3 (Wednesday)
    expect(curation).toBe('0 5 * * 3');
  });
});
