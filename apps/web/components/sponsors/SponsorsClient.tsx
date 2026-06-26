'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Sponsor } from '@digest/db';
import { Button } from '@/components/ui/Button';
import { SponsorCard } from './SponsorCard';
import { SponsorFormPanel } from './SponsorFormPanel';
import styles from './sponsors.module.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SponsorsClientProps {
  sponsors: Sponsor[];
}

// ---------------------------------------------------------------------------
// SponsorsClient — orchestrates the sponsor grid + slide-over add/edit panel.
// ---------------------------------------------------------------------------

export function SponsorsClient({ sponsors: initialSponsors }: SponsorsClientProps) {
  const router = useRouter();
  const [sponsors, setSponsors] = useState<Sponsor[]>(initialSponsors);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);

  // ── Panel open / close ────────────────────────────────────

  const openAddPanel = () => {
    setEditingSponsor(null);
    setPanelOpen(true);
  };

  const openEditPanel = (sponsor: Sponsor) => {
    setEditingSponsor(sponsor);
    setPanelOpen(true);
  };

  const closePanel = () => {
    setPanelOpen(false);
    setEditingSponsor(null);
  };

  // ── Card event handlers ───────────────────────────────────

  const handleToggled = (updated: Sponsor) => {
    setSponsors((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    router.refresh();
  };

  // ── Panel save success ────────────────────────────────────

  const handleSaved = (saved: Sponsor) => {
    if (editingSponsor) {
      setSponsors((prev) => prev.map((s) => (s.id === saved.id ? saved : s)));
    } else {
      setSponsors((prev) => [...prev, saved]);
    }
    closePanel();
    router.refresh();
  };

  return (
    <>
      {/* Page head */}
      <header className={styles.pagehead}>
        <div className={styles.pageheadLead}>
          <h2 className={styles.pageheadTitle}>Sponsorlar</h2>
          <p className={styles.pageheadDesc}>
            Sponsorlar, sayılardaki sponsorlu slotlarda gösterilir. Performansları sayı bazında
            izlenir.
          </p>
        </div>
        <div className={styles.pageheadActions}>
          <Button size="sm" onClick={openAddPanel} aria-label="Yeni sponsor ekle">
            + Yeni Sponsor
          </Button>
        </div>
      </header>

      {/* Sponsor grid */}
      {sponsors.length === 0 ? (
        <div className={styles.empty}>
          <p>
            Henüz sponsor eklenmedi. İlk sponsoru eklemek için &quot;+ Yeni Sponsor&quot; düğmesine
            tıklayın.
          </p>
        </div>
      ) : (
        <ul className={styles.sponsorGrid} aria-label="Sponsor listesi">
          {sponsors.map((sponsor) => (
            <SponsorCard
              key={sponsor.id}
              sponsor={sponsor}
              onEdit={openEditPanel}
              onToggled={handleToggled}
            />
          ))}
        </ul>
      )}

      {/* Slide-over form panel */}
      <SponsorFormPanel
        open={panelOpen}
        sponsor={editingSponsor}
        onClose={closePanel}
        onSaved={handleSaved}
      />
    </>
  );
}
