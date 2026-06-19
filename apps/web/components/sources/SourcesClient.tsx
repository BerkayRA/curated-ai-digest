'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Source } from '@digest/db';
import type { ApiResponse } from '@/lib/api-response';
import { Button } from '@/components/ui/Button';
import { SourceCard } from './SourceCard';
import { SourceFormPanel } from './SourceFormPanel';
import styles from './sources.module.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RunSummary {
  readonly fetched: number;
  readonly persisted: number;
  readonly deduped: number;
  readonly errors: ReadonlyArray<{ source: string; message: string }>;
}

interface SourcesClientProps {
  sources: Source[];
  exaConfigured: boolean;
}

// ---------------------------------------------------------------------------
// SourcesClient
// ---------------------------------------------------------------------------

export function SourcesClient({ sources: initialSources, exaConfigured }: SourcesClientProps) {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  // ── Scan all sources now ──────────────────────────────────

  const handleScanNow = async () => {
    if (scanning) return;
    setScanning(true);
    setScanStatus(null);
    try {
      const res = await fetch('/api/sources/run', { method: 'POST' });
      const json = (await res.json()) as ApiResponse<RunSummary>;
      if (json.success && json.data) {
        const { fetched, persisted, errors } = json.data;
        const errCount = errors.length;
        if (errCount > 0) {
          setScanStatus(
            `${fetched} aday tarandı, ${persisted} kaydedildi — ${errCount} hata`,
          );
        } else {
          setScanStatus(`${fetched} aday tarandı, ${persisted} kaydedildi`);
        }
        router.refresh();
      } else {
        setScanStatus(json.error ?? 'Tarama başarısız');
      }
    } catch {
      setScanStatus('Tarama sırasında bir hata oluştu');
    } finally {
      setScanning(false);
    }
  };

  // ── Panel open / close ────────────────────────────────────

  const openAddPanel = () => {
    setEditingSource(null);
    setPanelOpen(true);
  };

  const openEditPanel = (source: Source) => {
    setEditingSource(source);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingSource(null);
  };

  // ── Card event handlers ───────────────────────────────────

  const handleDeleted = (id: string) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
    router.refresh();
  };

  const handleToggled = (updated: Source) => {
    setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    router.refresh();
  };

  // ── Panel save success ────────────────────────────────────

  const handleSaved = (saved: Source) => {
    if (editingSource) {
      setSources((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    } else {
      setSources((prev) => [...prev, saved]);
    }
    closePanel();
    router.refresh();
  };

  return (
    <>
      {/* Page head */}
      <header className={styles.pagehead}>
        <div className={styles.pageheadLead}>
          <h2 className={styles.pageheadTitle}>Kaynaklar</h2>
          <p className={styles.pageheadDesc}>
            Haber digest kaynakları — RSS beslemeleri, Exa ve özel kayıt çeken adaptörler.
          </p>
        </div>
        <div className={styles.pageheadActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleScanNow}
            loading={scanning}
            aria-label="Tüm kaynakları şimdi tara"
          >
            ⟳ Şimdi Tara
          </Button>
          <Button size="sm" onClick={openAddPanel} aria-label="Yeni kaynak ekle">
            + Yeni Kaynak
          </Button>
        </div>
      </header>

      {/* Scan status line */}
      {scanStatus !== null && (
        <p className={styles.scanStatus} role="status">
          {scanStatus}
        </p>
      )}

      {/* Source grid */}
      {sources.length === 0 ? (
        <div className={styles.empty}>
          <p>Henüz kaynak eklenmedi. İlk kaynağı eklemek için &quot;+ Yeni Kaynak&quot; düğmesine tıklayın.</p>
        </div>
      ) : (
        <ul className={styles.sourceGrid} aria-label="Kaynak listesi">
          {sources.map((source) => (
            <SourceCard
              key={source.id}
              source={source}
              exaKeyMissing={!exaConfigured}
              onEdit={openEditPanel}
              onDeleted={handleDeleted}
              onToggled={handleToggled}
            />
          ))}
        </ul>
      )}

      {/* Slide-over form panel */}
      <SourceFormPanel
        open={panelOpen}
        source={editingSource}
        exaConfigured={exaConfigured}
        onClose={closePanel}
        onSaved={handleSaved}
      />
    </>
  );
}
