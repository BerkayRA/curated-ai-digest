'use client';

/**
 * Client signup form for the public landing page.
 *
 * Posts to /api/public/subscribe and, on a 202 (double opt-in queued), swaps the
 * card body for a "check your email" notice. Carries two lightweight anti-abuse
 * signals the API can weigh: a honeypot `website` field (hidden, must stay empty)
 * and `_t`, the ISO timestamp captured at mount (a too-fast submit is suspect).
 */

import { useRef, useState, type FormEvent } from 'react';
import styles from './signup.module.css';

interface SignupFormProps {
  topicSlug: string;
  topicName: string;
}

type SubmitState = 'idle' | 'submitting' | 'success';

const GENERIC_ERROR = 'Bir şeyler ters gitti, lütfen tekrar deneyin.';
const RATE_LIMIT_ERROR = 'Çok fazla istek, lütfen biraz sonra tekrar deneyin.';

export function SignupForm({ topicSlug, topicName }: SignupFormProps) {
  const mountedAt = useRef<string>(new Date().toISOString());
  const [state, setState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (state === 'submitting') return;

    const form = event.currentTarget;
    const data = new FormData(form);

    setState('submitting');
    setError(null);

    try {
      const response = await fetch('/api/public/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topicSlug,
          email: String(data.get('email') ?? ''),
          displayName: String(data.get('name') ?? ''),
          website: String(data.get('website') ?? ''),
          _t: mountedAt.current,
        }),
      });

      if (response.status === 202) {
        setState('success');
        return;
      }

      setState('idle');
      setError(response.status === 429 ? RATE_LIMIT_ERROR : GENERIC_ERROR);
    } catch {
      setState('idle');
      setError(GENERIC_ERROR);
    }
  }

  if (state === 'success') {
    return (
      <div className={styles.successNotice} role="status">
        <span className={styles.successMark} aria-hidden="true">
          ✓
        </span>
        <p className={styles.successText}>
          E-postanızı kontrol edin — onay bağlantısı gönderdik.
        </p>
      </div>
    );
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate={false}>
      <div className={styles.fieldGroup}>
        <label htmlFor="email" className={styles.label}>
          E-posta
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="siz@ornek.com"
          className={styles.input}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="name" className={styles.label}>
          Adınız <span className={styles.optional}>(isteğe bağlı)</span>
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Adınız"
          className={styles.input}
        />
      </div>

      {/* Honeypot — kept offscreen, must stay empty. Bots fill it; humans don't. */}
      <input
        className={styles.honeypot}
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        className={styles.submitButton}
        disabled={state === 'submitting'}
        aria-label={`${topicName} listesine abone ol`}
      >
        {state === 'submitting' ? 'Gönderiliyor…' : 'Abone Ol'}
      </button>
    </form>
  );
}
