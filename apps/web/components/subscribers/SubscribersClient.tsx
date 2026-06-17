'use client';

import { useState, useCallback } from 'react';
import type { Subscriber, SubscriberStatus } from '@mega-bulten/db';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubscriberFormModal } from './SubscriberFormModal';
import { CsvImportModal } from './CsvImportModal';
import type { ApiResponse } from '@/lib/api-response';
import styles from './subscribers.module.css';

interface SubscribersClientProps {
  initialSubscribers: Subscriber[];
}

const STATUS_LABELS: Record<SubscriberStatus, string> = {
  active: 'Aktif',
  unsubscribed: 'İptal',
  bounced: 'Geri Döndü',
};

type StatusFilter = 'all' | SubscriberStatus;

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function SubscribersClient({ initialSubscribers }: SubscribersClientProps) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>(initialSubscribers);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editingSubscriber, setEditingSubscriber] = useState<Subscriber | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = statusFilter === 'all'
    ? subscribers
    : subscribers.filter((s) => s.status === statusFilter);

  const handleCreated = useCallback((created: Subscriber) => {
    setSubscribers((prev) => [created, ...prev]);
    setIsCreating(false);
  }, []);

  const handleUpdated = useCallback((updated: Subscriber) => {
    setSubscribers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditingSubscriber(null);
  }, []);

  const handleImported = useCallback(() => {
    setIsImporting(false);
    // Refetch the full list after import
    fetch('/api/subscribers')
      .then((r) => r.json() as Promise<ApiResponse<Subscriber[]>>)
      .then((res) => {
        if (res.success && res.data) {
          setSubscribers(res.data);
        }
      })
      .catch(() => {
        // swallow — user can reload
      });
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/subscribers/${id}`, { method: 'DELETE' });
      const json = (await res.json()) as ApiResponse<{ deleted: boolean }>;
      if (json.success) {
        setSubscribers((prev) => prev.filter((s) => s.id !== id));
      }
    } finally {
      setDeletingId(null);
      setDeleteConfirmId(null);
    }
  }, []);

  return (
    <div>
      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="Durum filtresi">
          {(['all', 'active', 'unsubscribed', 'bounced'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              className={`${styles.filterBtn} ${statusFilter === f ? styles.filterBtnActive : ''}`}
              onClick={() => setStatusFilter(f)}
              aria-pressed={statusFilter === f}
            >
              {f === 'all' ? 'Tümü' : STATUS_LABELS[f as SubscriberStatus]}
              <span className={styles.filterCount}>
                {f === 'all'
                  ? subscribers.length
                  : subscribers.filter((s) => s.status === f).length}
              </span>
            </button>
          ))}
        </div>

        <div className={styles.toolbarActions}>
          <Button variant="secondary" size="sm" onClick={() => setIsImporting(true)}>
            CSV İçe Aktar
          </Button>
          <Button size="sm" onClick={() => setIsCreating(true)}>
            + Abone Ekle
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Abone bulunamadı"
          description={
            statusFilter === 'all'
              ? 'Henüz abone eklenmemiş.'
              : 'Bu durumda abone yok.'
          }
          action={
            statusFilter === 'all' ? (
              <Button size="sm" onClick={() => setIsCreating(true)}>
                İlk aboneyi ekle
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.tableWrapper}>
          <table className={styles.table} aria-label="Abone listesi">
            <thead>
              <tr>
                <th scope="col" className={styles.th}>Ad / E-posta</th>
                <th scope="col" className={styles.th}>Firma</th>
                <th scope="col" className={styles.th}>Durum</th>
                <th scope="col" className={styles.th}>Kaynak</th>
                <th scope="col" className={styles.th}>Eklenme</th>
                <th scope="col" className={styles.th}>
                  <span className="sr-only">İşlemler</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sub) => (
                <tr key={sub.id} className={styles.row}>
                  <td className={styles.td}>
                    {sub.displayName && (
                      <p className={styles.displayName}>{sub.displayName}</p>
                    )}
                    <p className={styles.email}>{sub.email}</p>
                  </td>
                  <td className={styles.td}>{sub.company ?? '—'}</td>
                  <td className={styles.td}>
                    <Badge variant={sub.status} label={STATUS_LABELS[sub.status]} />
                  </td>
                  <td className={styles.td}>
                    <span className={styles.source}>{sub.source}</span>
                  </td>
                  <td className={styles.td}>{formatDate(sub.createdAt)}</td>
                  <td className={styles.td}>
                    <div className={styles.rowActions}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingSubscriber(sub)}
                      >
                        Düzenle
                      </Button>
                      {deleteConfirmId === sub.id ? (
                        <>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={deletingId === sub.id}
                            onClick={() => handleDelete(sub.id)}
                          >
                            Onayla
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setDeleteConfirmId(null)}
                          >
                            İptal
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setDeleteConfirmId(sub.id)}
                        >
                          Sil
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

      {isCreating && (
        <SubscriberFormModal
          mode="create"
          onSaved={handleCreated}
          onClose={() => setIsCreating(false)}
        />
      )}

      {editingSubscriber && (
        <SubscriberFormModal
          mode="edit"
          subscriber={editingSubscriber}
          onSaved={handleUpdated}
          onClose={() => setEditingSubscriber(null)}
        />
      )}

      {isImporting && (
        <CsvImportModal
          onImported={handleImported}
          onClose={() => setIsImporting(false)}
        />
      )}
    </div>
  );
}
