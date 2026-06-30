'use client';

/**
 * Interactive list for the preference center. Each topic row has an optimistic
 * toggle (Abone ↔ Çıkış yapıldı); a global "leave all" action unsubscribes
 * every still-active list. Mutations POST to /api/public/preferences/[token];
 * a failed call rolls the row back and surfaces a Turkish error.
 */

import { useState } from 'react';
import styles from './preferences.module.css';

type MembershipStatus = 'pending' | 'active' | 'unsubscribed' | 'bounced';
type ConsentMode = 'business' | 'public';

export interface PreferenceTopic {
  topicId: string;
  topicName: string;
  consentMode: ConsentMode;
  status: MembershipStatus;
}

interface PreferencesClientProps {
  subscriberToken: string;
  topics: PreferenceTopic[];
}

const GENERIC_ERROR = 'İşlem tamamlanamadı, lütfen tekrar deneyin.';
const BUSINESS_REJOIN_ERROR = 'Bu listeye herkese açık abonelik kapalı.';

export function PreferencesClient({ subscriberToken, topics }: PreferencesClientProps) {
  const [rows, setRows] = useState<PreferenceTopic[]>(topics);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyStatus(topicId: string, status: MembershipStatus): void {
    setRows((prev) =>
      prev.map((row) => (row.topicId === topicId ? { ...row, status } : row)),
    );
  }

  async function mutate(
    topicId: string,
    action: 'subscribe' | 'unsubscribe',
  ): Promise<void> {
    if (busyId) return;

    const previous = rows.find((row) => row.topicId === topicId);
    if (!previous) return;

    setBusyId(topicId);
    setError(null);
    applyStatus(topicId, action === 'subscribe' ? 'active' : 'unsubscribed');

    try {
      const response = await fetch(`/api/public/preferences/${subscriberToken}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topicId, action }),
      });

      if (!response.ok) {
        applyStatus(topicId, previous.status);
        setError(response.status === 403 ? BUSINESS_REJOIN_ERROR : GENERIC_ERROR);
      }
    } catch {
      applyStatus(topicId, previous.status);
      setError(GENERIC_ERROR);
    } finally {
      setBusyId(null);
    }
  }

  async function leaveAll(): Promise<void> {
    for (const row of rows) {
      if (row.status === 'active' || row.status === 'pending') {
        // Sequential so each mutation observes a clean busy state and rolls back
        // independently on failure.
        await mutate(row.topicId, 'unsubscribe');
      }
    }
  }

  const hasActive = rows.some((row) => row.status === 'active' || row.status === 'pending');

  if (rows.length === 0) {
    return <p className={styles.empty}>Henüz hiçbir listeye abone değilsiniz.</p>;
  }

  return (
    <div className={styles.list}>
      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      <ul className={styles.topicList}>
        {rows.map((row) => {
          const subscribed = row.status === 'active' || row.status === 'pending';
          const action = subscribed ? 'unsubscribe' : 'subscribe';
          return (
            <li key={row.topicId} className={styles.topicRow}>
              <div className={styles.topicMeta}>
                <span className={styles.topicName}>{row.topicName}</span>
                <span
                  className={subscribed ? styles.stateOn : styles.stateOff}
                >
                  {subscribed ? 'Abone' : 'Çıkış yapıldı'}
                </span>
              </div>
              <button
                type="button"
                className={subscribed ? styles.toggleOn : styles.toggleOff}
                role="switch"
                aria-checked={subscribed}
                aria-label={`${row.topicName} aboneliği`}
                disabled={busyId === row.topicId}
                onClick={() => mutate(row.topicId, action)}
              >
                <span className={styles.toggleKnob} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        className={styles.leaveAll}
        disabled={!hasActive || busyId !== null}
        onClick={leaveAll}
      >
        Tüm listelerden çık
      </button>
    </div>
  );
}
