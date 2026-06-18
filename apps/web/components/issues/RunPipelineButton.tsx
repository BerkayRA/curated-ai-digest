'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { EyebrowLabel } from '@/components/ui/EyebrowLabel';
import type { ApiResponse } from '@/lib/api-response';
import styles from './run-pipeline.module.css';

interface PipelineResult {
  issueId: string;
  isoWeek: string;
  itemCount: number;
  qaFlagCount: number;
  costUsd: number;
}

interface RunPipelineButtonProps {
  /**
   * ISO week to run the pipeline for. When omitted, the server defaults to
   * next week. Passed through so the New page can keep it in sync with the form.
   */
  isoWeek?: string;
}

/**
 * Triggers the Claude curation pipeline for a week and surfaces the outcome.
 * On success it offers a link to the freshly-drafted issue.
 */
export function RunPipelineButton({ isoWeek }: RunPipelineButtonProps) {
  const router = useRouter();

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);

  const handleRun = async () => {
    setError(null);
    setResult(null);
    setRunning(true);

    try {
      const res = await fetch('/api/issues/run-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isoWeek ? { isoWeek } : {}),
      });

      const json = (await res.json()) as ApiResponse<PipelineResult>;
      if (!json.success || !json.data) {
        setError(json.error ?? 'Pipeline çalıştırılamadı.');
        return;
      }

      setResult(json.data);
    } catch {
      setError('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className={styles.panel} aria-labelledby="pipeline-heading">
      <div className={styles.head}>
        <EyebrowLabel as="span">Otomatik taslak</EyebrowLabel>
        <h2 id="pipeline-heading" className={styles.title}>
          Curation Pipeline
        </h2>
        <p className={styles.hint}>
          Claude tabanlı pipeline bu hafta için aday haberleri tarar, seçer ve bir taslak oluşturur.
        </p>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {result && (
        <p className={styles.success} role="status">
          {result.isoWeek} için taslak oluşturuldu — {result.itemCount} haber,{' '}
          {result.qaFlagCount} QA uyarısı.{' '}
          <button
            type="button"
            className={styles.openLink}
            onClick={() => router.push(`/issues/${result.issueId}`)}
          >
            Taslağı aç →
          </button>
        </p>
      )}

      <Button
        type="button"
        variant="secondary"
        onClick={handleRun}
        loading={running}
        className={styles.runBtn}
      >
        Curation&apos;ı şimdi çalıştır
      </Button>
    </section>
  );
}
