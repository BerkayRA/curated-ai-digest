'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Topic } from '@digest/db';
import { Button } from '@/components/ui/Button';
import { TopicCard } from './TopicCard';
import { TopicFormPanel } from './TopicFormPanel';
import styles from './topics.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TopicsClientProps {
  topics: Topic[];
}

// ---------------------------------------------------------------------------
// TopicsClient — orchestrates the topic grid + slide-over add/edit panel.
// ---------------------------------------------------------------------------

export function TopicsClient({ topics: initialTopics }: TopicsClientProps) {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>(initialTopics);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);

  // ── Panel open / close ────────────────────────────────────

  const openAddPanel = () => {
    setEditingTopic(null);
    setPanelOpen(true);
  };

  const openEditPanel = (topic: Topic) => {
    setEditingTopic(topic);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingTopic(null);
  };

  // ── Card event handlers ───────────────────────────────────

  const handleToggled = (updated: Topic) => {
    setTopics((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    router.refresh();
  };

  // ── Panel save success ────────────────────────────────────

  const handleSaved = (saved: Topic) => {
    if (editingTopic) {
      setTopics((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
    } else {
      setTopics((prev) => [...prev, saved]);
    }
    closePanel();
    router.refresh();
  };

  return (
    <>
      {/* Page head */}
      <header className={styles.pagehead}>
        <div className={styles.pageheadLead}>
          <h2 className={styles.pageheadTitle}>Konular</h2>
          <p className={styles.pageheadDesc}>
            Her konu kendi kaynakları, kitlesi ve sesiyle ayrı bir digest üretir.
          </p>
        </div>
        <div className={styles.pageheadActions}>
          <Button size="sm" onClick={openAddPanel} aria-label="Yeni konu ekle">
            + Yeni Konu
          </Button>
        </div>
      </header>

      {/* Topic grid */}
      {topics.length === 0 ? (
        <div className={styles.empty}>
          <p>
            Henüz konu eklenmedi. İlk konuyu eklemek için &quot;+ Yeni Konu&quot; düğmesine
            tıklayın.
          </p>
        </div>
      ) : (
        <ul className={styles.topicGrid} aria-label="Konu listesi">
          {topics.map((topic) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              onEdit={openEditPanel}
              onToggled={handleToggled}
            />
          ))}
        </ul>
      )}

      {/* Slide-over form panel */}
      <TopicFormPanel
        open={panelOpen}
        topic={editingTopic}
        onClose={closePanel}
        onSaved={handleSaved}
      />
    </>
  );
}
