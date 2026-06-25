'use client';

import { useState, useEffect, useRef } from 'react';
import type { Topic } from '@digest/db';
import type { ApiResponse } from '@/lib/api-response';
import styles from './topics.module.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TopicStatus = 'active' | 'paused';

// Allow the slide-in transition to begin before shifting focus to the panel.
const PANEL_FOCUS_DELAY_MS = 50;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TopicFormPanelProps {
  open: boolean;
  topic: Topic | null;
  onClose: () => void;
  onSaved: (saved: Topic) => void;
}

// ---------------------------------------------------------------------------
// TopicFormPanel — slide-over add/edit form for a topic.
// Create: POST /api/topics · Edit: PATCH /api/topics/[id] (slug editable too).
// ---------------------------------------------------------------------------

export function TopicFormPanel({ open, topic, onClose, onSaved }: TopicFormPanelProps) {
  const isEdit = topic !== null;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Form state ────────────────────────────────────────────

  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [audience, setAudience] = useState('');
  const [voice, setVoice] = useState('');
  const [status, setStatus] = useState<TopicStatus>('active');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Populate when editing ─────────────────────────────────

  useEffect(() => {
    if (!open) return;
    if (topic) {
      setSlug(topic.slug);
      setName(topic.name);
      setDescription(topic.description ?? '');
      setAudience(topic.audience ?? '');
      setVoice(topic.voice ?? '');
      setStatus(topic.status as TopicStatus);
    } else {
      setSlug('');
      setName('');
      setDescription('');
      setAudience('');
      setVoice('');
      setStatus('active');
    }
    setFormError(null);
  }, [open, topic]);

  // ── Focus management on open ──────────────────────────────

  useEffect(() => {
    if (open) {
      const id = setTimeout(() => closeButtonRef.current?.focus(), PANEL_FOCUS_DELAY_MS);
      return () => clearTimeout(id);
    }
  }, [open]);

  // ── Keyboard: close on Escape ─────────────────────────────

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  // ── Submit ────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    setSaving(true);

    const trimmedDescription = description.trim();
    const trimmedAudience = audience.trim();
    const trimmedVoice = voice.trim();

    const body: Record<string, unknown> = {
      slug: slug.trim(),
      name: name.trim(),
      description: trimmedDescription === '' ? null : trimmedDescription,
      audience: trimmedAudience === '' ? null : trimmedAudience,
      voice: trimmedVoice === '' ? null : trimmedVoice,
      status,
    };

    try {
      const endpoint = isEdit ? `/api/topics/${topic.id}` : '/api/topics';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as ApiResponse<Topic>;
      if (!json.success || !json.data) {
        setFormError(json.error ?? 'Kayıt başarısız');
        return;
      }

      onSaved(json.data);
    } catch {
      setFormError('Sunucuya bağlanırken bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────

  return (
    <>
      {/* Scrim */}
      <div
        className={`${styles.scrim} ${open ? styles.scrimOpen : ''}`}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? 'Konuyu düzenle' : 'Yeni konu ekle'}
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
      >
        {/* Panel head */}
        <div className={styles.panelHead}>
          <div className={styles.panelHeadText}>
            <p className={styles.pageheadDesc}>{isEdit ? 'Konuyu düzenle' : 'Yeni konu ekle'}</p>
            <h3 className={styles.panelTitle}>{isEdit ? topic.name : 'Konu Yapılandırması'}</h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.panelClose}
            aria-label="Paneli kapat"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Panel body */}
        <div className={styles.panelBody}>
          <form id="topic-form" onSubmit={handleSubmit} noValidate>
            {formError && (
              <p className={styles.formError} role="alert">
                {formError}
              </p>
            )}

            {/* Slug */}
            <div className={styles.formField}>
              <label htmlFor="topic-slug" className={styles.formLabel}>
                Slug
              </label>
              <input
                id="topic-slug"
                type="text"
                className={`${styles.formInput} ${styles.mono}`}
                value={slug}
                required
                placeholder="enterprise-ai"
                onChange={(e) => setSlug(e.target.value)}
              />
              <span className={styles.formHint}>
                URL ve dosya yollarında kullanılır — yalnızca küçük harf, rakam ve tire.
              </span>
            </div>

            {/* Name */}
            <div className={styles.formField}>
              <label htmlFor="topic-name" className={styles.formLabel}>
                Ad
              </label>
              <input
                id="topic-name"
                type="text"
                className={styles.formInput}
                value={name}
                required
                placeholder="Konu adı"
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className={styles.formField}>
              <label htmlFor="topic-description" className={styles.formLabel}>
                Açıklama
              </label>
              <textarea
                id="topic-description"
                className={styles.formTextarea}
                value={description}
                rows={3}
                placeholder="Bu konunun kısa tanımı"
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            {/* Audience */}
            <div className={styles.formField}>
              <label htmlFor="topic-audience" className={styles.formLabel}>
                Kitle
              </label>
              <textarea
                id="topic-audience"
                className={styles.formTextarea}
                value={audience}
                rows={3}
                placeholder="Hedef kitle tanımı — sıralama ve seçim istemlerine eklenir."
                onChange={(e) => setAudience(e.target.value)}
              />
              <span className={styles.formHint}>
                Sıralama, seçim ve QA istemlerine eklenir. Boş bırakılırsa varsayılan metin
                kullanılır.
              </span>
            </div>

            {/* Voice */}
            <div className={styles.formField}>
              <label htmlFor="topic-voice" className={styles.formLabel}>
                Ses / Üslup
              </label>
              <textarea
                id="topic-voice"
                className={styles.formTextarea}
                value={voice}
                rows={3}
                placeholder="Üslup ve ton tanımı — metin yazımı istemlerine eklenir."
                onChange={(e) => setVoice(e.target.value)}
              />
              <span className={styles.formHint}>
                Metin yazımı ve QA istemlerine eklenir. Boş bırakılırsa varsayılan metin kullanılır.
              </span>
            </div>

            {/* Status */}
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="topic-status">
                Durum
              </label>
              <select
                id="topic-status"
                className={styles.formSelect}
                value={status}
                onChange={(e) => setStatus(e.target.value as TopicStatus)}
              >
                <option value="active">Etkin</option>
                <option value="paused">Duraklatıldı</option>
              </select>
            </div>
          </form>
        </div>

        {/* Panel foot */}
        <div className={styles.panelFoot}>
          <button type="button" className={styles.cardBtn} onClick={onClose} disabled={saving}>
            İptal
          </button>
          <button
            type="submit"
            form="topic-form"
            className={`${styles.cardBtn} ${styles.cardBtnPrimary}`}
            disabled={saving}
            aria-busy={saving}
          >
            {saving ? '…' : isEdit ? 'Kaydet' : 'Ekle'}
          </button>
        </div>
      </div>
    </>
  );
}
