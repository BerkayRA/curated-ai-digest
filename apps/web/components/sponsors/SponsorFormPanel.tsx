'use client';

import { useState, useEffect, useRef } from 'react';
import type { Sponsor } from '@digest/db';
import type { ApiResponse } from '@/lib/api-response';
import styles from './sponsors.module.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Allow the slide-in transition to begin before shifting focus to the panel.
const PANEL_FOCUS_DELAY_MS = 50;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SponsorFormPanelProps {
  open: boolean;
  sponsor: Sponsor | null;
  onClose: () => void;
  onSaved: (saved: Sponsor) => void;
}

// ---------------------------------------------------------------------------
// SponsorFormPanel — slide-over add/edit form for a sponsor.
// Create: POST /api/sponsors · Edit: PATCH /api/sponsors/[id].
// ---------------------------------------------------------------------------

export function SponsorFormPanel({ open, sponsor, onClose, onSaved }: SponsorFormPanelProps) {
  const isEdit = sponsor !== null;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Form state ────────────────────────────────────────────

  const [name, setName] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Populate when editing ─────────────────────────────────

  useEffect(() => {
    if (!open) return;
    if (sponsor) {
      setName(sponsor.name);
      setWebsiteUrl(sponsor.websiteUrl);
      setLogoUrl(sponsor.logoUrl ?? '');
      setContactEmail(sponsor.contactEmail ?? '');
      setNotes(sponsor.notes ?? '');
      setActive(sponsor.active);
    } else {
      setName('');
      setWebsiteUrl('');
      setLogoUrl('');
      setContactEmail('');
      setNotes('');
      setActive(true);
    }
    setFormError(null);
  }, [open, sponsor]);

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

    const trimmedLogoUrl = logoUrl.trim();
    const trimmedContactEmail = contactEmail.trim();
    const trimmedNotes = notes.trim();

    const body: Record<string, unknown> = {
      name: name.trim(),
      websiteUrl: websiteUrl.trim(),
      logoUrl: trimmedLogoUrl === '' ? null : trimmedLogoUrl,
      contactEmail: trimmedContactEmail === '' ? null : trimmedContactEmail,
      notes: trimmedNotes === '' ? null : trimmedNotes,
      active,
    };

    try {
      const endpoint = isEdit ? `/api/sponsors/${sponsor.id}` : '/api/sponsors';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as ApiResponse<Sponsor>;
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
        aria-label={isEdit ? 'Sponsoru düzenle' : 'Yeni sponsor ekle'}
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
      >
        {/* Panel head */}
        <div className={styles.panelHead}>
          <div className={styles.panelHeadText}>
            <p className={styles.pageheadDesc}>
              {isEdit ? 'Sponsoru düzenle' : 'Yeni sponsor ekle'}
            </p>
            <h3 className={styles.panelTitle}>{isEdit ? sponsor.name : 'Sponsor Bilgileri'}</h3>
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
          <form id="sponsor-form" onSubmit={handleSubmit} noValidate>
            {formError && (
              <p className={styles.formError} role="alert">
                {formError}
              </p>
            )}

            {/* Name */}
            <div className={styles.formField}>
              <label htmlFor="sponsor-name" className={styles.formLabel}>
                Ad
              </label>
              <input
                id="sponsor-name"
                type="text"
                className={styles.formInput}
                value={name}
                required
                maxLength={120}
                placeholder="Sponsor adı"
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Website URL */}
            <div className={styles.formField}>
              <label htmlFor="sponsor-website" className={styles.formLabel}>
                Web Sitesi
              </label>
              <input
                id="sponsor-website"
                type="url"
                className={`${styles.formInput} ${styles.mono}`}
                value={websiteUrl}
                required
                maxLength={500}
                placeholder="https://…"
                onChange={(e) => setWebsiteUrl(e.target.value)}
              />
              <span className={styles.formHint}>
                E-posta ve arşivde bağlantı olarak gösterilir — yalnızca https.
              </span>
            </div>

            {/* Logo URL */}
            <div className={styles.formField}>
              <label htmlFor="sponsor-logo" className={styles.formLabel}>
                Logo Adresi
              </label>
              <input
                id="sponsor-logo"
                type="url"
                className={`${styles.formInput} ${styles.mono}`}
                value={logoUrl}
                maxLength={500}
                placeholder="https://…/logo.png"
                onChange={(e) => setLogoUrl(e.target.value)}
              />
              <span className={styles.formHint}>İsteğe bağlı — yalnızca https.</span>
            </div>

            {/* Contact email */}
            <div className={styles.formField}>
              <label htmlFor="sponsor-contact" className={styles.formLabel}>
                İletişim E-postası
              </label>
              <input
                id="sponsor-contact"
                type="email"
                className={styles.formInput}
                value={contactEmail}
                maxLength={320}
                placeholder="iletisim@sponsor.com"
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div className={styles.formField}>
              <label htmlFor="sponsor-notes" className={styles.formLabel}>
                Notlar
              </label>
              <textarea
                id="sponsor-notes"
                className={styles.formTextarea}
                value={notes}
                rows={3}
                maxLength={2000}
                placeholder="Sözleşme detayları, kampanya notları…"
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Active */}
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="sponsor-active">
                Durum
              </label>
              <select
                id="sponsor-active"
                className={styles.formSelect}
                value={active ? 'active' : 'inactive'}
                onChange={(e) => setActive(e.target.value === 'active')}
              >
                <option value="active">Etkin</option>
                <option value="inactive">Pasif</option>
              </select>
              <span className={styles.formHint}>
                Yalnızca etkin sponsorlar sponsorlu slota atanabilir.
              </span>
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
            form="sponsor-form"
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
