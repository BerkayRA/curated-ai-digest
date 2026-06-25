'use client';

import { useState, useEffect, useRef } from 'react';
import type { Source } from '@digest/db';
import type { ApiResponse } from '@/lib/api-response';
import { typeFieldsVisible } from './sources-utils';
import styles from './sources.module.css';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type SourceType = 'rss' | 'radar' | 'exa';

const RADAR_CATEGORIES = [
  { value: 'coding_agents', label: 'Coding Agents' },
  { value: 'general_agents', label: 'General Agents' },
  { value: 'mcp_tooling', label: 'MCP Tooling' },
  { value: 'sandbox_governance', label: 'Sandbox Governance' },
  { value: 'agent_frameworks', label: 'Agent Frameworks' },
  { value: 'model_serving', label: 'Model Serving' },
  { value: 'ai_infrastructure', label: 'AI Infrastructure' },
  { value: 'physical_ai_infrastructure', label: 'Physical AI Infra' },
  { value: 'fun_experimental', label: 'Fun / Experimental' },
] as const;

const RADAR_CHANGE_TYPES = [
  { value: 'new', label: 'Yeni' },
  { value: 'promoted', label: 'Yükseltildi' },
  { value: 'demoted', label: 'Düşürüldü' },
  { value: 'updated', label: 'Güncellendi' },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractQueriesText(config: unknown): string {
  if (!config || typeof config !== 'object') return '';
  const c = config as Record<string, unknown>;
  if (!Array.isArray(c.queries)) return '';
  return (c.queries as string[]).join('\n');
}

function extractRadarCategories(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  const c = config as Record<string, unknown>;
  return Array.isArray(c.categories) ? (c.categories as string[]) : [];
}

function extractRadarChangeTypes(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  const c = config as Record<string, unknown>;
  return Array.isArray(c.changeTypes) ? (c.changeTypes as string[]) : [];
}

function extractRadarMaxItems(config: unknown): string {
  if (!config || typeof config !== 'object') return '';
  const c = config as Record<string, unknown>;
  return typeof c.maxItems === 'number' ? String(c.maxItems) : '';
}

function extractRadarSiteRoot(config: unknown): string {
  if (!config || typeof config !== 'object') return '';
  const c = config as Record<string, unknown>;
  return typeof c.siteRoot === 'string' ? c.siteRoot : '';
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SourceFormPanelProps {
  open: boolean;
  source: Source | null;
  exaConfigured: boolean;
  topicSlug?: string;
  onClose: () => void;
  onSaved: (saved: Source) => void;
}

// ---------------------------------------------------------------------------
// SourceFormPanel
// ---------------------------------------------------------------------------

export function SourceFormPanel({
  open,
  source,
  exaConfigured,
  topicSlug,
  onClose,
  onSaved,
}: SourceFormPanelProps) {
  const isEdit = source !== null;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Form state ────────────────────────────────────────────

  const [type, setType] = useState<SourceType>('rss');
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [exaQueries, setExaQueries] = useState('');
  const [radarCategories, setRadarCategories] = useState<string[]>([]);
  const [radarChangeTypes, setRadarChangeTypes] = useState<string[]>([]);
  const [radarMaxItems, setRadarMaxItems] = useState('');
  const [radarSiteRoot, setRadarSiteRoot] = useState('');
  const [enabled, setEnabled] = useState(true);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { showUrl, showRadar, showExa } = typeFieldsVisible(type);

  // ── Populate when editing ─────────────────────────────────

  useEffect(() => {
    if (!open) return;
    if (source) {
      setType(source.type as SourceType);
      setLabel(source.label);
      setUrl(source.url ?? '');
      setExaQueries(extractQueriesText(source.config));
      setRadarCategories(extractRadarCategories(source.config));
      setRadarChangeTypes(extractRadarChangeTypes(source.config));
      setRadarMaxItems(extractRadarMaxItems(source.config));
      setRadarSiteRoot(extractRadarSiteRoot(source.config));
      setEnabled(source.enabled);
    } else {
      setType('rss');
      setLabel('');
      setUrl('');
      setExaQueries('');
      setRadarCategories([]);
      setRadarChangeTypes([]);
      setRadarMaxItems('');
      setRadarSiteRoot('');
      setEnabled(true);
    }
    setFormError(null);
  }, [open, source]);

  // ── Focus management on open ──────────────────────────────

  useEffect(() => {
    if (open) {
      // Small delay to let CSS transition start before shifting focus
      const id = setTimeout(() => closeButtonRef.current?.focus(), 50);
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

  // ── Chip toggle helpers ───────────────────────────────────

  const toggleCategory = (value: string) => {
    setRadarCategories((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  const toggleChangeType = (value: string) => {
    setRadarChangeTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  };

  // ── Build config payload ──────────────────────────────────

  const buildConfig = (): Record<string, unknown> | undefined => {
    if (type === 'exa') {
      const queries = exaQueries
        .split('\n')
        .map((q) => q.trim())
        .filter(Boolean);
      return queries.length > 0 ? { queries } : undefined;
    }
    if (type === 'radar') {
      const cfg: Record<string, unknown> = {};
      if (radarCategories.length > 0) cfg.categories = radarCategories;
      if (radarChangeTypes.length > 0) cfg.changeTypes = radarChangeTypes;
      if (radarMaxItems.trim()) cfg.maxItems = parseInt(radarMaxItems, 10);
      if (radarSiteRoot.trim()) cfg.siteRoot = radarSiteRoot.trim();
      return Object.keys(cfg).length > 0 ? cfg : undefined;
    }
    return undefined;
  };

  // ── Submit ────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    setSaving(true);

    const config = buildConfig();
    const body: Record<string, unknown> = {
      type,
      label: label.trim(),
      enabled,
    };
    if (showUrl) body.url = url.trim();
    if (config !== undefined) body.config = config;
    // On create, carry the active topic so the source lands under it. The
    // PATCH/update path never reassigns topic, so topicSlug is omitted there.
    if (!isEdit && topicSlug) body.topicSlug = topicSlug;

    try {
      const endpoint = isEdit ? `/api/sources/${source.id}` : '/api/sources';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as ApiResponse<Source>;
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
        aria-label={isEdit ? 'Kaynağı düzenle' : 'Yeni kaynak ekle'}
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
      >
        {/* Panel head */}
        <div className={styles.panelHead}>
          <div className={styles.panelHeadText}>
            <p className={styles.pageheadDesc}>{isEdit ? 'Kaynağı düzenle' : 'Yeni kaynak ekle'}</p>
            <h3 className={styles.panelTitle}>{isEdit ? source.label : 'Kaynak Yapılandırması'}</h3>
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
          <form id="source-form" onSubmit={handleSubmit} noValidate>
            {formError && (
              <p className={styles.formError} role="alert">
                {formError}
              </p>
            )}

            {/* Type selector */}
            <div className={styles.formField}>
              <label htmlFor="source-type" className={styles.formLabel}>
                Tür
              </label>
              <select
                id="source-type"
                className={styles.formSelect}
                value={type}
                disabled={isEdit}
                onChange={(e) => setType(e.target.value as SourceType)}
              >
                <option value="rss">📡 RSS Beslemesi</option>
                <option value="radar">🛰 Radar</option>
                <option value="exa">🔎 Exa Nöral Arama</option>
              </select>
              {isEdit && (
                <span className={styles.formHint}>Tür düzenleme sonrası değiştirilemez.</span>
              )}
            </div>

            {/* Label */}
            <div className={styles.formField}>
              <label htmlFor="source-label" className={styles.formLabel}>
                Etiket
              </label>
              <input
                id="source-label"
                type="text"
                className={styles.formInput}
                value={label}
                required
                placeholder="Kaynak adı"
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            {/* URL (RSS + Radar) */}
            {showUrl && (
              <div className={styles.formField}>
                <label htmlFor="source-url" className={styles.formLabel}>
                  URL
                </label>
                <input
                  id="source-url"
                  type="url"
                  className={`${styles.formInput} ${styles.mono}`}
                  value={url}
                  required={type !== 'exa'}
                  placeholder={
                    type === 'radar'
                      ? 'https://raw.githubusercontent.com/…/history.jsonl'
                      : 'https://example.com/feed.xml'
                  }
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>
            )}

            {/* Radar-specific fields */}
            {showRadar && (
              <>
                <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
                  <legend className={styles.fieldsetLegend}>Kategoriler (boş = tümü)</legend>
                  <div className={styles.chips}>
                    {RADAR_CATEGORIES.map(({ value, label: chipLabel }) => (
                      <label key={value} className={styles.chip}>
                        <input
                          type="checkbox"
                          className={styles.chipInput}
                          value={value}
                          checked={radarCategories.includes(value)}
                          onChange={() => toggleCategory(value)}
                        />
                        {chipLabel}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <fieldset style={{ border: 'none', margin: '0.75rem 0 0', padding: 0 }}>
                  <legend className={styles.fieldsetLegend}>Değişiklik Tipleri (boş = tümü)</legend>
                  <div className={styles.chips}>
                    {RADAR_CHANGE_TYPES.map(({ value, label: chipLabel }) => (
                      <label key={value} className={styles.chip}>
                        <input
                          type="checkbox"
                          className={styles.chipInput}
                          value={value}
                          checked={radarChangeTypes.includes(value)}
                          onChange={() => toggleChangeType(value)}
                        />
                        {chipLabel}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className={`${styles.formGrid2} ${styles.formField}`} style={{ marginTop: '0.75rem' }}>
                  <div>
                    <label htmlFor="radar-max-items" className={styles.formLabel}>
                      Maks. Öğe
                    </label>
                    <input
                      id="radar-max-items"
                      type="number"
                      min={1}
                      className={styles.formInput}
                      value={radarMaxItems}
                      placeholder="sınırsız"
                      onChange={(e) => setRadarMaxItems(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="radar-site-root" className={styles.formLabel}>
                      Site Kökü (URL)
                    </label>
                    <input
                      id="radar-site-root"
                      type="url"
                      className={`${styles.formInput} ${styles.mono}`}
                      value={radarSiteRoot}
                      placeholder="https://radar.example.com"
                      onChange={(e) => setRadarSiteRoot(e.target.value)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* Exa-specific fields */}
            {showExa && (
              <div className={styles.formField}>
                {!exaConfigured && (
                  <div className={styles.exaWarning} role="alert">
                    <span aria-hidden="true">⚠</span>
                    <span>
                      EXA_API_KEY ortam değişkeni tanımlı değil. Bu kaynak etkinleştirilse de
                      tarama yapılamaz.
                    </span>
                  </div>
                )}
                <label htmlFor="exa-queries" className={styles.formLabel} style={{ marginTop: '0.5rem' }}>
                  Sorgular (her satıra bir sorgu)
                </label>
                <textarea
                  id="exa-queries"
                  className={styles.formTextarea}
                  value={exaQueries}
                  placeholder={'AI agent frameworks\nLLM inference optimization\nMCP protocol updates'}
                  rows={5}
                  onChange={(e) => setExaQueries(e.target.value)}
                />
                <span className={styles.formHint}>
                  Her satır Exa nöral arama motoruna ayrı bir sorgu olarak gönderilir.
                </span>
              </div>
            )}

            {/* Enabled toggle */}
            <div className={styles.formField}>
              <label className={styles.formLabel} htmlFor="source-enabled">
                Durum
              </label>
              <select
                id="source-enabled"
                className={styles.formSelect}
                value={enabled ? 'enabled' : 'disabled'}
                onChange={(e) => setEnabled(e.target.value === 'enabled')}
              >
                <option value="enabled">Etkin</option>
                <option value="disabled">Devre Dışı</option>
              </select>
            </div>
          </form>
        </div>

        {/* Panel foot */}
        <div className={styles.panelFoot}>
          <button
            type="button"
            className={styles.cardBtn}
            onClick={onClose}
            disabled={saving}
          >
            İptal
          </button>
          <button
            type="submit"
            form="source-form"
            className={`${styles.cardBtn}`}
            disabled={saving}
            aria-busy={saving}
            style={{ color: 'var(--color-brand)', fontWeight: 700 }}
          >
            {saving ? '…' : isEdit ? 'Kaydet' : 'Ekle'}
          </button>
        </div>
      </div>
    </>
  );
}
