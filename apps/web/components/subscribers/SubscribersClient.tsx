'use client';

import { useState, useCallback } from 'react';
import type { Subscriber, SubscriberStatus, ConsentBasis } from '@digest/db';
import { Button } from '@/components/ui/Button';
import { StatusPill, subscriberStatusTone } from '@/components/ui/StatusPill';
import { EmptyState } from '@/components/ui/EmptyState';
import { SubscriberFormModal } from './SubscriberFormModal';
import { CsvImportModal } from './CsvImportModal';
import type { ApiResponse } from '@/lib/api-response';
import styles from './subscribers.module.css';

interface TopicOption {
  id: string;
  slug: string;
  name: string;
}

interface SubscribersClientProps {
  initialSubscribers: Subscriber[];
  topics: TopicOption[];
  activeTopicId: string;
  activeTopicSlug: string | null;
  activeTopicName: string | null;
  /** subscriberId → active topicId[] */
  topicsBySubscriber: Record<string, string[]>;
  /** subscriberId → consent basis for the active-topic membership */
  consentBySubscriber: Record<string, ConsentBasis>;
}

const STATUS_LABELS: Record<SubscriberStatus, string> = {
  active: 'Aktif',
  pending: 'Onay Bekliyor',
  unsubscribed: 'İptal',
  bounced: 'Geri Döndü',
};

const CONSENT_BASIS_LABELS: Record<ConsentBasis, string> = {
  import: 'İçe Aktarma',
  double_opt_in: 'Çift Onay',
  business_relationship: 'İş İlişkisi',
  single_opt_in: 'Tek Onay',
};

type StatusFilter = 'all' | SubscriberStatus;

function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

export function SubscribersClient({
  initialSubscribers,
  topics,
  activeTopicId,
  activeTopicSlug,
  activeTopicName,
  topicsBySubscriber,
  consentBySubscriber,
}: SubscribersClientProps) {
  const [subscribers, setSubscribers] = useState<Subscriber[]>(initialSubscribers);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editingSubscriber, setEditingSubscriber] = useState<Subscriber | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<Record<string, string[]>>(topicsBySubscriber);
  const [membershipBusyId, setMembershipBusyId] = useState<string | null>(null);

  const topicNameById = new Map(topics.map((t) => [t.id, t.name] as const));

  const toggleActiveTopic = useCallback(
    async (subscriberId: string, isMember: boolean) => {
      setMembershipBusyId(subscriberId);
      try {
        const res = await fetch(`/api/subscribers/${subscriberId}/topics`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicId: activeTopicId,
            action: isMember ? 'remove' : 'add',
          }),
        });
        const json = (await res.json()) as ApiResponse<unknown>;
        if (!json.success) return;

        setMemberships((prev) => {
          const current = prev[subscriberId] ?? [];
          const next = isMember
            ? current.filter((id) => id !== activeTopicId)
            : [...current, activeTopicId];
          return { ...prev, [subscriberId]: next };
        });
      } finally {
        setMembershipBusyId(null);
      }
    },
    [activeTopicId],
  );

  const filtered =
    statusFilter === 'all' ? subscribers : subscribers.filter((s) => s.status === statusFilter);

  const handleCreated = useCallback(
    (created: Subscriber) => {
      setSubscribers((prev) => [created, ...prev]);
      // Manual create scopes the new subscriber to the active topic.
      setMemberships((prev) => ({ ...prev, [created.id]: [activeTopicId] }));
      setIsCreating(false);
    },
    [activeTopicId],
  );

  const handleUpdated = useCallback((updated: Subscriber) => {
    setSubscribers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditingSubscriber(null);
  }, []);

  const handleImported = useCallback(() => {
    setIsImporting(false);
    // Refetch the full list + active-topic memberships after import.
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

    fetch(`/api/topics/${activeTopicId}/subscribers`)
      .then((r) => r.json() as Promise<ApiResponse<{ subscriberId: string }[]>>)
      .then((res) => {
        if (!res.success || !res.data) return;
        const ids = res.data.map((m) => m.subscriberId);
        setMemberships((prev) => {
          const next = { ...prev };
          for (const id of ids) {
            const current = next[id] ?? [];
            if (!current.includes(activeTopicId)) next[id] = [...current, activeTopicId];
          }
          return next;
        });
      })
      .catch(() => {
        // swallow — user can reload
      });
  }, [activeTopicId]);

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
          description={statusFilter === 'all' ? 'Henüz abone eklenmemiş.' : 'Bu durumda abone yok.'}
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
                <th scope="col" className={styles.th}>
                  Ad / E-posta
                </th>
                <th scope="col" className={styles.th}>
                  Firma
                </th>
                <th scope="col" className={styles.th}>
                  Durum
                </th>
                <th scope="col" className={styles.th}>
                  Kaynak
                </th>
                <th scope="col" className={styles.th}>
                  Konular
                </th>
                <th scope="col" className={styles.th}>
                  Onay
                </th>
                <th scope="col" className={styles.th}>
                  Eklenme
                </th>
                <th scope="col" className={styles.th}>
                  <span className="sr-only">İşlemler</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sub) => (
                <tr key={sub.id} className={styles.row}>
                  <td className={styles.td}>
                    {sub.displayName && <p className={styles.displayName}>{sub.displayName}</p>}
                    <p className={styles.email}>{sub.email}</p>
                  </td>
                  <td className={styles.td}>{sub.company ?? '—'}</td>
                  <td className={styles.td}>
                    <StatusPill
                      tone={subscriberStatusTone(sub.status)}
                      label={STATUS_LABELS[sub.status]}
                    />
                  </td>
                  <td className={styles.td}>
                    <span className={styles.source}>{sub.source}</span>
                  </td>
                  <td className={styles.td}>
                    <div className={styles.topicBadges}>
                      {(memberships[sub.id] ?? []).length === 0 ? (
                        <span className={styles.topicEmpty}>—</span>
                      ) : (
                        (memberships[sub.id] ?? []).map((topicId) => (
                          <span key={topicId} className={styles.topicBadge}>
                            {topicNameById.get(topicId) ?? topicId}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                  <td className={styles.td}>
                    {(() => {
                      const basis = consentBySubscriber[sub.id];
                      return (
                        <span className={styles.consentBasis}>
                          {basis ? CONSENT_BASIS_LABELS[basis] : '—'}
                        </span>
                      );
                    })()}
                  </td>
                  <td className={styles.td}>{formatDate(sub.createdAt)}</td>
                  <td className={styles.td}>
                    <div className={styles.rowActions}>
                      {(() => {
                        const isMember = (memberships[sub.id] ?? []).includes(activeTopicId);
                        return (
                          <Button
                            variant={isMember ? 'secondary' : 'ghost'}
                            size="sm"
                            loading={membershipBusyId === sub.id}
                            onClick={() => toggleActiveTopic(sub.id, isMember)}
                            title={activeTopicName ?? undefined}
                          >
                            {isMember ? 'Konudan Çıkar' : 'Konuya Ekle'}
                          </Button>
                        );
                      })()}
                      <Button variant="ghost" size="sm" onClick={() => setEditingSubscriber(sub)}>
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
          topicSlug={activeTopicSlug}
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
          topicSlug={activeTopicSlug}
          topicName={activeTopicName}
          onImported={handleImported}
          onClose={() => setIsImporting(false)}
        />
      )}
    </div>
  );
}
