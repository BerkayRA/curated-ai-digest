'use client';

import { useState } from 'react';
import type { Settings } from '@mega-bulten/db';
import type { UpdateSettingsDto } from '@mega-bulten/shared';
import { Button } from '@/components/ui/Button';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import type { ApiResponse } from '@/lib/api-response';
import styles from './settings.module.css';

interface SettingsFormProps {
  settings: Settings | null;
}

const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const DAY_LABELS: Record<(typeof DAYS_OF_WEEK)[number], string> = {
  Monday: 'Pazartesi',
  Tuesday: 'Salı',
  Wednesday: 'Çarşamba',
  Thursday: 'Perşembe',
  Friday: 'Cuma',
  Saturday: 'Cumartesi',
  Sunday: 'Pazar',
};

const PROVIDER_LABELS = {
  acs_email: 'Azure Communication Services',
  microsoft_graph: 'Microsoft Graph',
  resend: 'Resend',
} as const;

export function SettingsForm({ settings }: SettingsFormProps) {
  const [autoSendEnabled, setAutoSendEnabled] = useState(settings?.autoSendEnabled ?? false);
  const [sendDayOfWeek, setSendDayOfWeek] = useState<string>(settings?.sendDayOfWeek ?? 'Thursday');
  const [sendTime, setSendTime] = useState(settings?.sendTime ?? '09:00');
  const [timezone, setTimezone] = useState(settings?.timezone ?? 'Europe/Istanbul');
  const [activeProvider, setActiveProvider] = useState<string>(
    settings?.activeProvider ?? 'acs_email',
  );
  const [fromAddress, setFromAddress] = useState(settings?.fromAddress ?? '');
  const [replyTo, setReplyTo] = useState(settings?.replyTo ?? '');
  const [pipelineLeadDays, setPipelineLeadDays] = useState(settings?.pipelineLeadDays ?? 2);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  if (!settings) {
    return (
      <div className={styles.noSettings}>
        <p>Settings satırı bulunamadı. Seed çalıştırıldı mı?</p>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaving(true);

    const payload: UpdateSettingsDto = {
      autoSendEnabled,
      sendDayOfWeek: sendDayOfWeek as UpdateSettingsDto['sendDayOfWeek'],
      sendTime,
      timezone,
      activeProvider: activeProvider as UpdateSettingsDto['activeProvider'],
      fromAddress: fromAddress || undefined,
      replyTo: replyTo || undefined,
      pipelineLeadDays,
    };

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = (await res.json()) as ApiResponse<Settings>;
      if (!json.success) {
        setSaveError(json.error ?? 'Kayıt başarısız');
        return;
      }
      setSavedAt(new Date());
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form} noValidate>
      {saveError && (
        <p className={styles.formError} role="alert">
          {saveError}
        </p>
      )}
      {savedAt && !saveError && (
        <p className={styles.formSuccess} role="status">
          Kaydedildi — {savedAt.toLocaleTimeString('tr-TR')}
        </p>
      )}

      {/* Auto-send section */}
      <section className={styles.section} aria-labelledby="autosend-heading">
        <div className={styles.sectionHead}>
          <EyebrowLabel as="span">Otomatik gönderim</EyebrowLabel>
          <h2 id="autosend-heading" className={styles.sectionTitle}>
            Otomatik Gönderim
          </h2>
        </div>
        <div className={styles.toggleRow}>
          <label htmlFor="auto-send" className={styles.toggleLabel}>
            <span className={styles.toggleLabelText}>Otomatik Gönderim Aktif</span>
            <span className={styles.toggleLabelHint}>
              QA ve guardrail koşulları sağlandığında insan onayı olmadan gönderilir
            </span>
          </label>
          <button
            id="auto-send"
            type="button"
            role="switch"
            aria-checked={autoSendEnabled}
            className={`${styles.toggle} ${autoSendEnabled ? styles.toggleOn : ''}`}
            onClick={() => setAutoSendEnabled((v) => !v)}
          >
            <span className={styles.toggleThumb} />
            <span className="sr-only">{autoSendEnabled ? 'Aktif' : 'Devre Dışı'}</span>
          </button>
        </div>
      </section>

      {/* Schedule section */}
      <section className={styles.section} aria-labelledby="schedule-heading">
        <div className={styles.sectionHead}>
          <EyebrowLabel as="span">Gönderim</EyebrowLabel>
          <h2 id="schedule-heading" className={styles.sectionTitle}>
            Gönderim Planı
          </h2>
        </div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label htmlFor="send-day" className={styles.label}>
              Gün
            </label>
            <select
              id="send-day"
              className={styles.select}
              value={sendDayOfWeek}
              onChange={(e) => setSendDayOfWeek(e.target.value)}
            >
              {DAYS_OF_WEEK.map((d) => (
                <option key={d} value={d}>
                  {DAY_LABELS[d]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="send-time" className={styles.label}>
              Saat (HH:mm)
            </label>
            <input
              id="send-time"
              type="time"
              className={styles.input}
              value={sendTime}
              onChange={(e) => setSendTime(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="timezone" className={styles.label}>
              Zaman Dilimi
            </label>
            <input
              id="timezone"
              type="text"
              className={styles.input}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="Europe/Istanbul"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="lead-days" className={styles.label}>
              Pipeline Öncülük (gün)
            </label>
            <input
              id="lead-days"
              type="number"
              min={0}
              max={14}
              className={styles.input}
              value={pipelineLeadDays}
              onChange={(e) => setPipelineLeadDays(Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      {/* Email provider section */}
      <section className={styles.section} aria-labelledby="provider-heading">
        <div className={styles.sectionHead}>
          <EyebrowLabel as="span">Sağlayıcı</EyebrowLabel>
          <h2 id="provider-heading" className={styles.sectionTitle}>
            E-posta Sağlayıcısı
          </h2>
        </div>
        <div className={styles.fieldGrid}>
          <div className={styles.field}>
            <label htmlFor="provider" className={styles.label}>
              Aktif Sağlayıcı
            </label>
            <select
              id="provider"
              className={styles.select}
              value={activeProvider}
              onChange={(e) => setActiveProvider(e.target.value)}
            >
              {(Object.keys(PROVIDER_LABELS) as (keyof typeof PROVIDER_LABELS)[]).map((k) => (
                <option key={k} value={k}>
                  {PROVIDER_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="from-address" className={styles.label}>
              Gönderen Adresi
            </label>
            <input
              id="from-address"
              type="email"
              className={styles.input}
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="bulten@mega.com.tr"
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="reply-to" className={styles.label}>
              Reply-To Adresi
            </label>
            <input
              id="reply-to"
              type="email"
              className={styles.input}
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="iletisim@mega.com.tr"
              autoComplete="email"
            />
          </div>
        </div>
      </section>

      <div className={styles.formActions}>
        <Button type="submit" loading={saving}>
          Kaydet
        </Button>
      </div>
    </form>
  );
}
