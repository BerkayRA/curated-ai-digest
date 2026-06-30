/**
 * /login — branded sign-in page.
 *
 * AUTH_MODE=entra  → "Microsoft ile giriş yap" SSO button.
 * AUTH_MODE=local  → email + password credentials form.
 *
 * Auth errors from Auth.js are surfaced via ?error=... search param.
 */

import Image from 'next/image';
import { redirect } from 'next/navigation';
import { AuthError } from 'next-auth';
import { auth, signIn } from '@/auth';
import styles from './login.module.css';

export const metadata = {
  title: 'Giriş Yap — Curated AI Digest',
};

// ---------------------------------------------------------------------------
// Error message map (Auth.js passes these as ?error= params)
// ---------------------------------------------------------------------------

const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: 'Microsoft ile giriş başlatılamadı. Lütfen tekrar deneyin.',
  OAuthCallback: 'Microsoft oturum açma geri araması başarısız oldu.',
  OAuthCreateAccount: 'Hesap oluşturulamadı. Lütfen yöneticinize başvurun.',
  AccessDenied: 'Bu hesabın erişimi yok. Lütfen yöneticinize başvurun.',
  Verification: 'Doğrulama bağlantısı geçersiz veya süresi dolmuş.',
  CredentialsSignin: 'E-posta veya şifre hatalı.',
  Default: 'Giriş yapılırken bir hata oluştu. Lütfen tekrar deneyin.',
};

function getErrorMessage(code: string | undefined): string | null {
  if (!code) return null;
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES['Default']!;
}

// ---------------------------------------------------------------------------
// Server action for local credentials sign-in
// ---------------------------------------------------------------------------

async function localSignIn(formData: FormData): Promise<void> {
  'use server';
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/',
    });
  } catch (error) {
    // A failed sign-in throws an AuthError — surface it as a friendly ?error=
    // param on /login instead of an uncaught server-side exception. The success
    // path throws NEXT_REDIRECT (not an AuthError), so it is re-thrown untouched.
    if (error instanceof AuthError) {
      const code = error.type === 'CredentialsSignin' ? 'CredentialsSignin' : 'Default';
      redirect(`/login?error=${code}`);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Server action for Entra SSO sign-in
// ---------------------------------------------------------------------------

async function entraSignIn(): Promise<void> {
  'use server';
  await signIn('microsoft-entra-id', { redirectTo: '/' });
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

interface LoginPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

export default async function LoginPage(props: LoginPageProps) {
  const searchParams = await props.searchParams;
  // Already signed in — go to dashboard
  const session = await auth();
  if (session) {
    redirect('/');
  }

  const authMode = (process.env.AUTH_MODE ?? 'entra') as 'entra' | 'local';
  const errorMessage = getErrorMessage(searchParams.error);

  return (
    <main className={styles.page}>
      <article className={styles.card}>
        {/* Brand header band — official Mega Bilgisayar chameleon logo, white on Process Blue */}
        <header className={styles.cardHeader}>
          <Image
            className={styles.logo}
            src="/brand/mega-logo-white.svg"
            width={200}
            height={65}
            alt="Mega Bilgisayar Tic. Ltd. Şti"
            priority
          />
          <span className={styles.productLabel}>Curated AI Digest · Yönetim Paneli</span>
        </header>

        <div className={styles.cardBody}>
          <h1 className={styles.heading}>Hoş Geldiniz</h1>
          <p className={styles.subheading}>
            {authMode === 'entra'
              ? 'Mega Bilgisayar kurumsal hesabınızla giriş yapın.'
              : 'Yönetici hesabınızla giriş yapın.'}
          </p>

          {/* Error notice */}
          {errorMessage && (
            <div className={styles.errorNotice} role="alert">
              <span className={styles.errorIcon} aria-hidden="true">
                !
              </span>
              <p className={styles.errorText}>{errorMessage}</p>
            </div>
          )}

          {authMode === 'entra' ? (
            /* ── Entra SSO ── */
            (<form action={entraSignIn}>
              <button type="submit" className={styles.ssoButton}>
                {/* Microsoft logo (simplified inline SVG) */}
                <svg
                  className={styles.microsoftIcon}
                  viewBox="0 0 21 21"
                  aria-hidden="true"
                  focusable="false"
                >
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                Microsoft ile giriş yap
              </button>
            </form>)
          ) : (
            /* ── Local credentials form ── */
            (<form action={localSignIn} className={styles.form}>
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
                  placeholder="admin@megabilgisayar.com.tr"
                  className={styles.input}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label htmlFor="password" className={styles.label}>
                  Şifre
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  className={styles.input}
                />
              </div>
              <button type="submit" className={styles.submitButton}>
                Giriş Yap
              </button>
            </form>)
          )}
        </div>
      </article>
    </main>
  );
}
