'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Suppression, SuppressionReason } from '@digest/db';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ApiResponse } from '@/lib/api-response';
import styles from './suppression.module.css';

interface SuppressionListProps {
  initialData: Suppression[];
  initialTotal: number;
}

const REASON_LABELS: Record<SuppressionReason, string> = {
  hard_bounce: 'Sert Geri Dönüş',
  // reserved — not yet written by any path (future count-then-suppress)
  soft_bounce_threshold: 'Yumuşak Geri Dönüş',
  complaint: 'Şikayet',
  manual: 'Manuel',
};

const SEARCH_DEBOUNCE_MS = 300;

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function SuppressionList({ initialData, initialTotal }: SuppressionListProps) {
  const [rows, setRows] = useState<Suppression[]>(initialData);
  const [total, setTotal] = useState(initialTotal);
  const [search, setSearch] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Skip the debounced fetch on the very first render — the server already
  // provided the initial page.
  const isFirstRender = useRef(true);

  const fetchRows = useCallback(async (term: string) => {
    const params = new URLSearchParams();
    if (term.trim()) params.set('search', term.trim());
    try {
      const res = await fetch(`/api/suppression?${params.toString()}`);
      const json = (await res.json()) as ApiResponse<Suppression[]>;
      if (json.success && json.data) {
        setRows(json.data);
        setTotal(json.meta?.total ?? json.data.length);
      }
    } catch {
      setErrorMessage('Liste yüklenemedi. Lütfen tekrar deneyin.');
    }
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const handle = setTimeout(() => void fetchRows(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [search, fetchRows]);

  const handleAdd = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const email = newEmail.trim();
      if (!email) return;

      setErrorMessage(null);
      setIsAdding(true);
      try {
        const res = await fetch('/api/suppression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const json = (await res.json()) as ApiResponse<Suppression>;
        if (!json.success || !json.data) {
          setErrorMessage(json.error ?? 'Adres eklenemedi.');
          return;
        }
        const created = json.data;
        // Optimistic prepend, de-duped on id (upsert may return an existing row).
        setRows((prev) => [created, ...prev.filter((r) => r.id !== created.id)]);
        setTotal((prev) => (rows.some((r) => r.id === created.id) ? prev : prev + 1));
        setNewEmail('');
      } catch {
        setErrorMessage('Adres eklenemedi. Lütfen tekrar deneyin.');
      } finally {
        setIsAdding(false);
      }
    },
    [newEmail, rows],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      setErrorMessage(null);
      setDeletingId(id);
      const snapshot = rows;
      // Optimistic removal.
      setRows((prev) => prev.filter((r) => r.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      try {
        const res = await fetch(`/api/suppression/${id}`, { method: 'DELETE' });
        const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
        if (!json.success) {
          setRows(snapshot);
          setTotal(snapshot.length);
          setErrorMessage(json.error ?? 'Kayıt silinemedi.');
        }
      } catch {
        setRows(snapshot);
        setTotal(snapshot.length);
        setErrorMessage('Kayıt silinemedi. Lütfen tekrar deneyin.');
      } finally {
        setDeletingId(null);
        setConfirmId(null);
      }
    },
    [rows],
  );

  return (
    <div>
      <div className={styles.toolbar}>
        <input
          type="search"
          className={styles.search}
          placeholder="E-posta ara…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="E-posta ara"
        />

        <form className={styles.addForm} onSubmit={handleAdd}>
          <input
            type="email"
            className={styles.addInput}
            placeholder="ornek@firma.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            aria-label="Engellenecek e-posta"
            required
          />
          <Button size="sm" type="submit" loading={isAdding} disabled={!newEmail.trim()}>
            Manuel Ekle
          </Button>
        </form>
      </div>

      {errorMessage && (
        <p className={styles.error} role="alert">
          {errorMessage}
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="Engelli adres yok"
          description={
            search
              ? 'Aramayla eşleşen kayıt bulunamadı.'
              : 'Sert geri dönüş, şikayet veya manuel eklemeler burada görünür.'
          }
        />
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table} aria-label="Engellenen adresler">
            <thead>
              <tr>
                <th scope="col" className={styles.th}>
                  E-posta
                </th>
                <th scope="col" className={styles.th}>
                  Sebep
                </th>
                <th scope="col" className={styles.th}>
                  Kaynak
                </th>
                <th scope="col" className={styles.th}>
                  Tarih
                </th>
                <th scope="col" className={styles.th}>
                  <span className="sr-only">İşlemler</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={styles.row}>
                  <td className={styles.td}>
                    <span className={styles.email}>{row.email}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.reason}>{REASON_LABELS[row.reason]}</span>
                  </td>
                  <td className={styles.td}>
                    <span className={styles.source}>{row.source}</span>
                  </td>
                  <td className={styles.td}>{formatDate(row.createdAt)}</td>
                  <td className={styles.td}>
                    <div className={styles.rowActions}>
                      {confirmId === row.id ? (
                        <>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={deletingId === row.id}
                            onClick={() => handleRemove(row.id)}
                          >
                            Onayla
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmId(null)}
                          >
                            İptal
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setConfirmId(row.id)}
                        >
                          Kaldır
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.source} style={{ marginTop: 'var(--space-sm)' }}>
        Toplam {total} engelli adres
      </p>
    </div>
  );
}
