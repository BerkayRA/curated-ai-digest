'use client';

import { useState, useEffect, useRef } from 'react';
import type { Topic } from '@digest/db';
import type { ApiResponse } from '@/lib/api-response';
import styles from './topics.module.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TopicStatus = 'active' | 'paused';
type ConsentMode = 'business' | 'public';
type Language = 'tr' | 'en';

// Fallback swatch shown by the native color input before the user picks a
// brand color. Stored value stays null until they intentionally choose one.
const DEFAULT_BRAND_COLOR = '#009fda';

// Reset the "copied" confirmation after this delay.
const COPY_RESET_MS = 2000;

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
  const [consentMode, setConsentMode] = useState<ConsentMode>('business');

  // ── Brand & language state ────────────────────────────────

  const [language, setLanguage] = useState<Language>('tr');
  const [brandName, setBrandName] = useState('');
  const [brandLogoUrl, setBrandLogoUrl] = useState('');
  const [brandColorHex, setBrandColorHex] = useState('');
  const [brandFooterText, setBrandFooterText] = useState('');

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [signupCopied, setSignupCopied] = useState(false);

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
      setConsentMode(topic.consentMode as ConsentMode);
      setLanguage((topic.language as Language) ?? 'tr');
      setBrandName(topic.brandName ?? '');
      setBrandLogoUrl(topic.brandLogoUrl ?? '');
      setBrandColorHex(topic.brandColorHex ?? '');
      setBrandFooterText(topic.brandFooterText ?? '');
    } else {
      setSlug('');
      setName('');
      setDescription('');
      setAudience('');
      setVoice('');
      setStatus('active');
      setConsentMode('business');
      setLanguage('tr');
      setBrandName('');
      setBrandLogoUrl('');
      setBrandColorHex('');
      setBrandFooterText('');
    }
    setFormError(null);
    setSignupCopied(false);
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
    const trimmedBrandName = brandName.trim();
    const trimmedBrandLogoUrl = brandLogoUrl.trim();
    const trimmedBrandColorHex = brandColorHex.trim();
    const trimmedBrandFooterText = brandFooterText.trim();

    const body: Record<string, unknown> = {
      slug: slug.trim(),
      name: name.trim(),
      description: trimmedDescription === '' ? null : trimmedDescription,
      audience: trimmedAudience === '' ? null : trimmedAudience,
      voice: trimmedVoice === '' ? null : trimmedVoice,
      status,
      consentMode,
      language,
      brandName: trimmedBrandName === '' ? null : trimmedBrandName,
      brandLogoUrl: trimmedBrandLogoUrl === '' ? null : trimmedBrandLogoUrl,
      brandColorHex: trimmedBrandColorHex === '' ? null : trimmedBrandColorHex,
      brandFooterText: trimmedBrandFooterText === '' ? null : trimmedBrandFooterText,
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

  // ── Public signup link (edit-mode + public consent only) ──

  const showSignupLink = isEdit && consentMode === 'public';
  const signupUrl =
    showSignupLink && typeof window !== 'undefined'
      ? `${window.location.origin}/s/${topic.slug}`
      : '';

  const handleCopySignupUrl = async () => {
    if (signupUrl === '') return;
    try {
      await navigator.clipboard.writeText(signupUrl);
      setSignupCopied(true);
      setTimeout(() => setSignupCopied(false), COPY_RESET_MS);
    } catch {
      setSignupCopied(false);
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

            {/* ── Brand & language ──────────────────────────── */}
            <p className={styles.formSection}>Marka ve Dil</p>

            {/* Language */}
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="topic-language">
                Dil
              </label>
              <select
                id="topic-language"
                className={styles.formSelect}
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
              >
                <option value="tr">Türkçe</option>
                <option value="en">İngilizce</option>
              </select>
              <span className={styles.formHint}>
                Seçim, metin yazımı ve e-posta/arşiv kopyasının dili.
              </span>
            </div>

            {/* Brand name */}
            <div className={styles.formField}>
              <label htmlFor="topic-brand-name" className={styles.formLabel}>
                Marka Adı
              </label>
              <input
                id="topic-brand-name"
                type="text"
                className={styles.formInput}
                value={brandName}
                maxLength={120}
                placeholder="Curated AI Digest"
                onChange={(e) => setBrandName(e.target.value)}
              />
              <span className={styles.formHint}>
                Boş bırakılırsa varsayılan ad &ldquo;Curated AI Digest&rdquo; kullanılır.
              </span>
            </div>

            {/* Brand logo URL */}
            <div className={styles.formField}>
              <label htmlFor="topic-brand-logo" className={styles.formLabel}>
                Logo Adresi
              </label>
              <input
                id="topic-brand-logo"
                type="url"
                className={`${styles.formInput} ${styles.mono}`}
                value={brandLogoUrl}
                maxLength={500}
                placeholder="https://…/logo.png"
                onChange={(e) => setBrandLogoUrl(e.target.value)}
              />
              <span className={styles.formHint}>Boş bırakılırsa Mega logosu kullanılır.</span>
            </div>

            {/* Brand color */}
            <div className={styles.formField}>
              <label htmlFor="topic-brand-color" className={styles.formLabel}>
                Marka Rengi
              </label>
              <div className={styles.colorRow}>
                <input
                  id="topic-brand-color"
                  type="color"
                  className={styles.colorSwatchInput}
                  value={brandColorHex === '' ? DEFAULT_BRAND_COLOR : brandColorHex}
                  aria-label="Marka rengini seç"
                  onChange={(e) => setBrandColorHex(e.target.value)}
                />
                <input
                  type="text"
                  className={`${styles.formInput} ${styles.mono}`}
                  value={brandColorHex}
                  maxLength={7}
                  placeholder="#RRGGBB"
                  aria-label="Marka rengi onaltılık değer"
                  onChange={(e) => setBrandColorHex(e.target.value)}
                />
                {brandColorHex !== '' && (
                  <button
                    type="button"
                    className={`${styles.cardBtn} ${styles.colorClear}`}
                    onClick={() => setBrandColorHex('')}
                  >
                    Temizle
                  </button>
                )}
              </div>
              <span className={styles.formHint}>Vurgu rengi (e-posta + arşiv).</span>
            </div>

            {/* Brand footer text */}
            <div className={styles.formField}>
              <label htmlFor="topic-brand-footer" className={styles.formLabel}>
                Alt Bilgi Metni
              </label>
              <input
                id="topic-brand-footer"
                type="text"
                className={styles.formInput}
                value={brandFooterText}
                maxLength={500}
                placeholder="E-posta altında görünen kısa açıklama"
                onChange={(e) => setBrandFooterText(e.target.value)}
              />
              <span className={styles.formHint}>
                E-posta ve arşivin altındaki marka açıklaması. Boş bırakılırsa varsayılan metin
                kullanılır.
              </span>
            </div>

            {/* ── Yayın ──────────────────────────────────────── */}
            <p className={styles.formSection}>Yayın</p>

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

            {/* Consent mode */}
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="topic-consent-mode">
                Kayıt Modu
              </label>
              <select
                id="topic-consent-mode"
                className={styles.formSelect}
                value={consentMode}
                onChange={(e) => setConsentMode(e.target.value as ConsentMode)}
              >
                <option value="business">İş İlişkisi (kapalı liste)</option>
                <option value="public">Herkese Açık (çift onaylı kayıt)</option>
              </select>
              <span className={styles.formHint}>
                İş ilişkisi modunda herkese açık kayıt sayfası oluşturulmaz.
              </span>
            </div>

            {/* Public signup link (read-only) */}
            {showSignupLink && (
              <div className={styles.formField}>
                <label className={styles.formLabel} htmlFor="topic-signup-url">
                  Kayıt Bağlantısı
                </label>
                <div className={styles.copyRow}>
                  <input
                    id="topic-signup-url"
                    type="text"
                    className={`${styles.formInput} ${styles.mono}`}
                    value={signupUrl}
                    readOnly
                  />
                  <button
                    type="button"
                    className={styles.cardBtn}
                    onClick={handleCopySignupUrl}
                    aria-label="Kayıt bağlantısını kopyala"
                  >
                    {signupCopied ? 'Kopyalandı' : 'Kopyala'}
                  </button>
                </div>
              </div>
            )}
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
