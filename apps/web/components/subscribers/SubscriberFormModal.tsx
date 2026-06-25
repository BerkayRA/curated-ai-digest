'use client';

import { useState } from 'react';
import type { Subscriber } from '@digest/db';
import { Button } from '@/components/ui/Button';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import type { ApiResponse } from '@/lib/api-response';
import styles from './subscribers.module.css';

interface SubscriberFormModalProps {
  mode: 'create' | 'edit';
  subscriber?: Subscriber;
  /** On create, the new subscriber is opted into this topic (null → default). */
  topicSlug?: string | null;
  onSaved: (subscriber: Subscriber) => void;
  onClose: () => void;
}

export function SubscriberFormModal({
  mode,
  subscriber,
  topicSlug,
  onSaved,
  onClose,
}: SubscriberFormModalProps) {
  const [email, setEmail] = useState(subscriber?.email ?? '');
  const [displayName, setDisplayName] = useState(subscriber?.displayName ?? '');
  const [company, setCompany] = useState(subscriber?.company ?? '');
  const [status, setStatus] = useState(subscriber?.status ?? 'active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const url = mode === 'create' ? '/api/subscribers' : `/api/subscribers/${subscriber!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const body =
        mode === 'create'
          ? {
              email,
              displayName: displayName || undefined,
              company: company || undefined,
              topicSlug: topicSlug ?? undefined,
            }
          : { displayName: displayName || undefined, company: company || undefined, status };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as ApiResponse<Subscriber>;
      if (!json.success || !json.data) {
        setError(json.error ?? 'Beklenmeyen hata');
        return;
      }

      onSaved(json.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalHeading}>
            <EyebrowLabel as="span">Abone</EyebrowLabel>
            <h2 id="modal-title" className={styles.modalTitle}>
              {mode === 'create' ? 'Yeni Abone' : 'Aboneyi Düzenle'}
            </h2>
          </div>
          <button className={styles.modalClose} onClick={onClose} aria-label="Kapat" type="button">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          {error && (
            <p className={styles.formError} role="alert">
              {error}
            </p>
          )}

          <div className={styles.field}>
            <label htmlFor="sub-email" className={styles.label}>
              E-posta <span aria-hidden="true">*</span>
            </label>
            <input
              id="sub-email"
              type="email"
              className={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={mode === 'edit'}
              placeholder="ornek@sirket.com"
              autoComplete="email"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="sub-name" className={styles.label}>
              Ad Soyad
            </label>
            <input
              id="sub-name"
              type="text"
              className={styles.input}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ad Soyad"
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="sub-company" className={styles.label}>
              Firma
            </label>
            <input
              id="sub-company"
              type="text"
              className={styles.input}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Şirket adı"
            />
          </div>

          {mode === 'edit' && (
            <div className={styles.field}>
              <label htmlFor="sub-status" className={styles.label}>
                Durum
              </label>
              <select
                id="sub-status"
                className={styles.select}
                value={status}
                onChange={(e) => setStatus(e.target.value as 'active' | 'unsubscribed' | 'bounced')}
              >
                <option value="active">Aktif</option>
                <option value="unsubscribed">Abonelik İptal</option>
                <option value="bounced">Geri Döndü</option>
              </select>
            </div>
          )}

          <div className={styles.formActions}>
            <Button type="button" variant="secondary" onClick={onClose}>
              İptal
            </Button>
            <Button type="submit" loading={loading}>
              {mode === 'create' ? 'Ekle' : 'Kaydet'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
