# Security Policy

## Supported versions

Mega Bülten is pre-1.0; only the latest `main` is supported with security fixes.

| Version | Supported |
| --- | --- |
| `0.1.x` (latest `main`) | ✅ |
| older / forks | ❌ |

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Report vulnerabilities privately to **berkay.adanali@megabilgisayar.com.tr**. Include:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if possible),
- affected component(s) / file paths, and
- any suggested remediation.

You can expect an acknowledgement within a few business days. We follow coordinated,
responsible disclosure: we'll work with you on a fix and a disclosure timeline, and credit you
in the release notes if you wish.

## Scope highlights

This is a self-hosted, internet-facing newsletter system. Areas worth scrutiny include the
dashboard auth (Microsoft Entra ID SSO / argon2 fallback) and middleware, the admin API route
handlers (authorization + CSRF), the public unsubscribe endpoint, email rendering of
model-generated content, the news-ingestion fetchers (SSRF/feed input), and secret handling for
the Anthropic / Exa / email-provider / Entra credentials.

## Hardening status

Applied security fixes and known deferred items (e.g. distributed rate limiting, nonce-based
CSP) are tracked in the internal audit at [`docs/SECURITY.md`](docs/SECURITY.md). Secrets are
read only from the environment; only `.env.example` files are committed.
