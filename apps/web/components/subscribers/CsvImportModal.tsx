'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import type { ApiResponse } from '@/lib/api-response';
import type { ImportResult } from '@/app/api/subscribers/import/route';
import styles from './subscribers.module.css';

interface CsvImportModalProps {
  onImported: () => void;
  onClose: () => void;
}

export function CsvImportModal({ onImported, onClose }: CsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setError(null);
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/subscribers/import', {
        method: 'POST',
        body: formData,
      });

      const json = (await res.json()) as ApiResponse<ImportResult>;
      if (!json.success || !json.data) {
        setError(json.error ?? 'İçe aktarma başarısız');
        return;
      }

      setResult(json.data);
    } finally {
      setLoading(false);
    }
  };

  const rowErrorEntries = result ? Object.entries(result.rowErrors) : [];

  return (
    <div
      className={styles.modalOverlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div className={styles.modalHeading}>
            <EyebrowLabel as="span">Toplu içe aktarma</EyebrowLabel>
            <h2 id="import-modal-title" className={styles.modalTitle}>
              CSV İçe Aktar
            </h2>
          </div>
          <button className={styles.modalClose} onClick={onClose} aria-label="Kapat" type="button">
            ×
          </button>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className={styles.form}>
            <p className={styles.importHint}>
              CSV dosyası <code className={styles.code}>email</code> sütunu içermeli;{' '}
              <code className={styles.code}>displayName</code> ve{' '}
              <code className={styles.code}>company</code> isteğe bağlıdır.
            </p>

            {error && (
              <p className={styles.formError} role="alert">
                {error}
              </p>
            )}

            <div className={styles.field}>
              <label htmlFor="csv-file" className={styles.label}>
                CSV Dosyası <span aria-hidden="true">*</span>
              </label>
              <input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                className={styles.fileInput}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                required
              />
            </div>

            <div className={styles.formActions}>
              <Button type="button" variant="secondary" onClick={onClose}>
                İptal
              </Button>
              <Button type="submit" loading={loading} disabled={!file}>
                İçe Aktar
              </Button>
            </div>
          </form>
        ) : (
          <div className={styles.importResult}>
            <div className={styles.importStats}>
              <div className={styles.importStat}>
                <span className={styles.importStatValue}>{result.imported}</span>
                <span className={styles.importStatLabel}>Eklendi</span>
              </div>
              <div className={styles.importStat}>
                <span className={styles.importStatValue}>{result.skippedExisting}</span>
                <span className={styles.importStatLabel}>Zaten Kayıtlı</span>
              </div>
              <div className={styles.importStat}>
                <span className={styles.importStatValue}>{result.skippedDuplicates}</span>
                <span className={styles.importStatLabel}>CSV İçi Tekrar</span>
              </div>
            </div>

            {rowErrorEntries.length > 0 && (
              <div className={styles.rowErrors}>
                <p className={styles.rowErrorsTitle}>{rowErrorEntries.length} satırda hata:</p>
                <ul className={styles.rowErrorList}>
                  {rowErrorEntries.map(([row, msg]) => (
                    <li key={row} className={styles.rowErrorItem}>
                      <strong>Satır {row}:</strong> {msg}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.formActions}>
              <Button onClick={onImported}>Tamam</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
