# Operations Runbook — Curated AI Digest

**Last Updated:** 2026-06-17

This guide walks an operator through setting up and running Curated AI Digest. Follow each section in order.

---

## 1. Prerequisites

Before you start, have the following ready:

### Infrastructure
- **Docker & Docker Compose** (version 20.10+)
- **PostgreSQL volume** (Docker Compose will create one automatically)
- **Node.js 20+** (for local development or running migrations without Docker)

### External Accounts & Credentials

You will need API keys and credentials from these services:

1. **Anthropic API key**
   - Required for Claude-powered curation pipeline
   - Obtain from: https://console.anthropic.com/settings/keys
   - Format: `sk-ant-...`

2. **Exa API key**
   - Required for neural search ingestion
   - Obtain from: https://exa.ai/docs/api
   - Contact Exa support if you don't have one

3. **Email Provider Credentials**
   - Choose **one** of the following:
     - **Azure Communication Services (ACS)** — recommended for bulk sends
       - ACS resource endpoint
       - ACS connection string or access key
       - Verified sender email domain (e.g., `digest@megabilgisayar.com.tr`)
     - **Microsoft Graph** — use if you have O365 with bulk sendMail access
       - Tenant ID, Client ID, Client Secret
       - Licensed user UPN for sending
     - **Resend** — third-party service alternative
       - Resend API key

4. **Microsoft Entra ID App Registration** (required only if `AUTH_MODE=entra`)
   - Azure AD Tenant ID
   - App Registration Client ID and Secret
   - Configured redirect URI: `{APP_BASE_URL}/api/auth/callback/microsoft-entra-id`
   - **Caution:** This is a production-only auth mode. For local development, use `AUTH_MODE=local`.

---

## 2. Environment Setup

### 2.1 Clone & Install Dependencies

```bash
cd /path/to/curated-ai-digest
pnpm install
```

### 2.2 Database Connection String

Create a `.env` file at the root with the database URL:

```bash
DATABASE_URL="postgresql://digest:digest@localhost:5433/curated_ai_digest"
```

This matches the `docker-compose.yml` credentials. If you change them, update both.

### 2.3 Environment Variables by Service

Copy each `.env.example` to `.env` in its respective directory and fill in the values.

#### **`apps/web/.env`** — Next.js Dashboard

```bash
# Copy the template
cp apps/web/.env.example apps/web/.env
```

Required variables:

| Variable | Purpose | Example | Notes |
|----------|---------|---------|-------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://digest:digest@localhost:5433/curated_ai_digest` | **Required.** Must match docker-compose |
| `APP_BASE_URL` | Dashboard base URL | `http://localhost:3100` or `https://digest.example.com` | **Required.** Used for auth redirects |
| `AUTH_SECRET` | Session signing secret | `$(openssl rand -base64 32)` | **Required.** Generate fresh value (see below) |
| `AUTH_MODE` | Auth strategy | `local` (dev) or `entra` (prod) | **Required.** Default is `local` for dev |
| `ADMIN_EMAIL` | Local auth admin email | `admin@mega.com.tr` | **Required if `AUTH_MODE=local`** |
| `ADMIN_PASSWORD_HASH` | Argon2id hash of admin password | `$argon2id$v=19$m=65536,...` | **Required if `AUTH_MODE=local`** (see below) |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | Entra app client ID | (UUID from Azure) | **Required if `AUTH_MODE=entra`** |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | Entra app client secret | (secret value) | **Required if `AUTH_MODE=entra`** |
| `AUTH_MICROSOFT_ENTRA_ID_ISSUER` | Entra token issuer URL | `https://login.microsoftonline.com/{TENANT_ID}/v2.0` | **Required if `AUTH_MODE=entra`** |
| `AUTH_ALLOWED_TENANT_ID` | Allow-list tenant | (same as TENANT_ID) | **Required if `AUTH_MODE=entra`** |
| `AUTH_ALLOWED_GROUP_ID` | (Optional) Entra group ID | (empty to skip group enforcement) | Optional. If empty, uses `AUTH_ALLOWED_EMAIL_DOMAIN` |
| `AUTH_ALLOWED_EMAIL_DOMAIN` | (Optional) Email domain allow-list | `mega.com.tr` | Optional. Used if `AUTH_ALLOWED_GROUP_ID` is empty |

#### **`apps/worker/.env`** — Curation Pipeline & Scheduler

```bash
# Copy the template
cp apps/worker/.env.example apps/worker/.env
```

Required variables:

| Variable | Purpose | Example | Notes |
|----------|---------|---------|-------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://digest:digest@localhost:5433/curated_ai_digest` | **Required.** Must match web |
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-...` | **Required.** Obtain from Anthropic console |
| `EXA_API_KEY` | Exa search API key | `...` | **Required.** Contact Exa support |
| `APP_BASE_URL` | Web app base URL | `https://digest.example.com` | **Required.** Used for unsubscribe links |
| `ACS_CONNECTION_STRING` | ACS connection string | `endpoint=https://...;accesskey=...` | **Required if `activeProvider=acs_email` in Settings** |
| `ACS_SENDER_ADDRESS` | ACS verified sender | `digest@megabilgisayar.com.tr` | **Required if `activeProvider=acs_email` in Settings** |
| `GRAPH_TENANT_ID` | Azure AD tenant ID | (UUID) | **Required if `activeProvider=microsoft_graph` in Settings** |
| `GRAPH_CLIENT_ID` | Graph app client ID | (UUID) | **Required if `activeProvider=microsoft_graph` in Settings** |
| `GRAPH_CLIENT_SECRET` | Graph app secret | (secret value) | **Required if `activeProvider=microsoft_graph` in Settings** |
| `GRAPH_SENDER_ID` | Graph sender UPN | `digest@example.com` | **Required if `activeProvider=microsoft_graph` in Settings** |
| `RESEND_API_KEY` | Resend API key | `re_...` | **Required if `activeProvider=resend` in Settings** |
| `AUTOSEND_MIN_SUBSCRIBERS` | Min subscribers for auto-send | `1` | Optional. Default: 1 |
| `AUTOSEND_MAX_SUBSCRIBERS` | Max subscribers for auto-send | `50000` | Optional. Default: 50000 |
| `AUTOSEND_KILL_SWITCH` | Emergency auto-send disable | `false` | Optional. Set `true` to stop all auto-sends |

#### **`packages/db/.env`** — Prisma

```bash
# Copy the template
cp packages/db/.env.example packages/db/.env
```

| Variable | Purpose | Example | Notes |
|----------|---------|---------|-------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://digest:digest@localhost:5433/curated_ai_digest` | **Required.** Must match other .env files |

#### **`packages/curation/.env`** — Curation Pipeline

```bash
# Copy the template
cp packages/curation/.env.example packages/curation/.env
```

| Variable | Purpose | Example | Notes |
|----------|---------|---------|-------|
| `ANTHROPIC_API_KEY` | Claude API key | `sk-ant-...` | **Required.** Same as worker |
| `EXA_API_KEY` | Exa search API key | `...` | **Required.** Same as worker |
| `DATABASE_URL` | PostgreSQL connection | `postgresql://digest:digest@localhost:5433/curated_ai_digest` | **Required.** Same as others |

#### **`packages/email/.env`** — Email Providers

```bash
# Copy the template
cp packages/email/.env.example packages/email/.env
```

| Variable | Purpose | Example | Notes |
|----------|---------|---------|-------|
| `EMAIL_PROVIDER` | Active provider | `acs_email`, `microsoft_graph`, or `resend` | **Required.** Default: `acs_email`. Note: this is a recommendation; actual provider is set in Settings model in the database |
| (ACS/Graph/Resend vars) | Provider credentials | (see above) | Fill in based on which provider(s) you want to support |

---

## 3. Secret Generation

### 3.1 AUTH_SECRET

Generate a random 32-byte base64 string for signing sessions:

```bash
openssl rand -base64 32
```

**Example output:**
```
xK7vZ9pL3mQ8jH2wN6aB5dF1sU4rT9cG0vW2yX8kL
```

Paste this into `apps/web/.env` as `AUTH_SECRET`.

### 3.2 ADMIN_PASSWORD_HASH (Local Auth Mode Only)

If using `AUTH_MODE=local` (development), you must set an admin password hash.

Generate an Argon2id hash:

```bash
node -e "require('argon2').hash('your-password-here').then(h => console.log(h))"
```

**Example output:**
```
$argon2id$v=19$m=65536,t=3,p=4$xV7mZ9pL3qK8jH2wN6aB$5dF1sU4rT9cG0vW2yX8kL...
```

Paste this into `apps/web/.env` as `ADMIN_PASSWORD_HASH`.

**Security note:** This hash is one-way. Keep the plaintext password safe but separate from the `.env` file.

### 3.3 AUTH_MODE Switch

In `apps/web/.env`, choose your auth mode:

**For local development (no Entra ID):**
```bash
AUTH_MODE="local"
ADMIN_EMAIL="admin@mega.com.tr"
ADMIN_PASSWORD_HASH="$argon2id$v=19$m=65536,t=3,p=4$..."
```

**For production with Entra ID SSO:**
```bash
AUTH_MODE="entra"
AUTH_MICROSOFT_ENTRA_ID_ID="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
AUTH_MICROSOFT_ENTRA_ID_SECRET="your-client-secret"
AUTH_MICROSOFT_ENTRA_ID_ISSUER="https://login.microsoftonline.com/your-tenant-id/v2.0"
AUTH_ALLOWED_TENANT_ID="your-tenant-id"
AUTH_ALLOWED_EMAIL_DOMAIN="mega.com.tr"  # or use AUTH_ALLOWED_GROUP_ID instead
```

---

## 4. Entra ID App Registration (AUTH_MODE=entra only)

**Skip this section if you are using `AUTH_MODE=local`.**

If you want to deploy with Entra ID SSO, you need an Azure AD app registration. This is production-only.

### 4.1 Create App Registration in Azure Portal

1. Go to **Azure Portal** → **Azure Active Directory** → **App registrations** → **New registration**
2. **Name:** `Curated AI Digest` (or your preferred name)
3. **Supported account types:** Choose based on your tenant setup (typically "Accounts in this organizational directory only")
4. **Redirect URI:**
   - **Platform:** Web
   - **URI:** `{APP_BASE_URL}/api/auth/callback/microsoft-entra-id`
   - Example: `https://digest.megabilgisayar.com.tr/api/auth/callback/microsoft-entra-id`
5. Click **Register**

### 4.2 Capture Client ID & Tenant ID

After registration, you'll see:

- **Application (client) ID** — copy this to `AUTH_MICROSOFT_ENTRA_ID_ID`
- **Directory (tenant) ID** — copy this to `AUTH_ALLOWED_TENANT_ID` and build the issuer URL

### 4.3 Create Client Secret

1. Go to **Certificates & secrets** → **Client secrets** → **New client secret**
2. **Description:** `Curated AI Digest API`
3. **Expires:** Choose your preferred expiration (e.g., 2 years)
4. Click **Add**
5. Copy the **Value** (not the ID) to `AUTH_MICROSOFT_ENTRA_ID_SECRET`

**⚠️ Warning:** This secret is shown only once. Copy it immediately and store it safely.

### 4.4 Configure API Permissions

1. Go to **API permissions** → **Add a permission** → **Microsoft Graph**
2. Select **Delegated permissions**
3. Add:
   - `openid`
   - `profile`
   - `email`
4. (Optional) If enforcing group membership, also add:
   - `Directory.Read.All`
5. Click **Grant admin consent**

### 4.5 Configure Token Claims (Optional: Group Enforcement)

If you want to enforce group membership (`AUTH_ALLOWED_GROUP_ID`):

1. Go to **Token configuration** → **Add groups claim**
2. Select:
   - **Token types:** ID token (and/or Access token if needed)
   - **Groups claim options:** `Directory groups only` (most restrictive)
3. Click **Add**

Then in `apps/web/.env`, set `AUTH_ALLOWED_GROUP_ID` to the Object ID of your Entra group.

### 4.6 Build Issuer URL

Combine your tenant ID to form the issuer URL:

```
https://login.microsoftonline.com/{TENANT_ID}/v2.0
```

Example:
```
https://login.microsoftonline.com/12345678-1234-1234-1234-123456789012/v2.0
```

Paste this into `AUTH_MICROSOFT_ENTRA_ID_ISSUER`.

---

## 5. Email Deliverability (Critical)

Email is the core feature of Curated AI Digest. This section covers the most important operations decision.

### 5.1 Dedicated Sending Subdomain (Strongly Recommended)

**Problem:** If you send from your corporate domain (`info@megabilgisayar.com.tr`), bounces and complaints will damage your domain reputation, affecting all business email.

**Solution:** Use a **dedicated subdomain** for newsletter sends (e.g., `digest@megabilgisayar.com.tr` or `noreply-digest@megabilgisayar.com.tr`).

**Benefits:**
- Reputation isolation: newsletter reputation does not affect corporate email
- Easier to switch providers or retire later
- Best practice recommended by all ESPs

### 5.2 DNS Records for Email Deliverability

All three email providers require SPF, DKIM, and DMARC records. You **must own and control the domain** (or have DNS admin access).

#### **For Azure Communication Services (ACS)**

ACS provides dedicated subdomains or allows you to bring your own. Follow the steps:

1. **In Azure Portal**, go to your ACS resource → **Domains**
2. If using an ACS-provided subdomain (e.g., `*.azurecomm.net`), ACS handles SPF/DKIM
3. If bringing your own domain (e.g., `digest.megabilgisayar.com.tr`):
   - Azure will provide DNS record values
   - Add these records to your DNS provider:
     - **SPF record**
     - **DKIM record(s)** (usually multiple CNAME records)
     - **DMARC record** (optional but recommended)

**SPF Example:**
```
digest.megabilgisayar.com.tr IN TXT "v=spf1 include:spf.protection.outlook.com ~all"
```

**DKIM Example (provided by ACS):**
```
selector1._domainkey.digest.megabilgisayar.com.tr IN CNAME selector1-digest-megabilgisayar-com-tr._domainkey.azurecomm.net
```

**DMARC Example:**
```
_dmarc.digest.megabilgisayar.com.tr IN TXT "v=DMARC1; p=quarantine; rua=mailto:dmarc-report@megabilgisayar.com.tr"
```

#### **For Microsoft Graph**

Graph uses your O365/Exchange Online infrastructure. You should already have SPF/DKIM/DMARC for your primary domain.

**If** you are using a subdomain:
- Add the subdomain to your O365 domain list
- Configure SPF/DKIM/DMARC for the subdomain (or rely on wildcard records)

**Exchange throttle caveat:** Graph is subject to O365 throttling (~4 requests/second per tenant). For lists >100 subscribers, use ACS or Resend instead.

#### **For Resend**

1. Go to **Resend Dashboard** → **Domains** → **Add Domain**
2. Enter your domain (e.g., `digest.megabilgisayar.com.tr`)
3. Resend provides DNS records to add:
   - SPF record
   - DKIM record(s)
   - DMARC record (recommended)
4. Add these to your DNS provider and wait for verification (~5–30 minutes)

### 5.3 Verifying Email Deliverability

After configuring DNS:

1. **Send a test email** (see section 6.4)
2. **Check delivery:**
   - Look for the message in the recipient inbox (not spam)
   - Check authentication headers: `Authentication-Results: ...; dkim=pass; spf=pass`
3. **Monitor bounce rates:**
   - Use your provider's dashboard (ACS / Resend)
   - Expect <5% hard bounces for a clean subscriber list
4. **Set up monitoring:**
   - Configure bounce notifications in Settings
   - Regularly review `Send` table for failed deliveries

### 5.4 Provider Selection

Choose **one** of the three providers and fill in its credentials:

| Provider | When to Use | Setup Complexity | Throttle Risk |
|----------|----------|---------|-----------|
| **ACS** | Default; recommended for most cases | Medium (domain verification) | None (designed for bulk) |
| **Graph** | Already have O365; <100 subscribers | Low (use O365 creds) | **HIGH** (4 req/s limit) |
| **Resend** | Want third-party simplicity | Low (API key only) | None (designed for bulk) |

**Recommendation:** Start with **ACS** if you have an Azure subscription, or **Resend** if not.

---

## 6. First Run

### 6.1 Start Infrastructure

```bash
cd /path/to/curated-ai-digest

# Start PostgreSQL and Adminer
pnpm db:up

# Wait for database to be ready (check the healthcheck)
docker ps
# Look for "digest_db" with status "healthy"
```

### 6.2 Run Database Migrations

```bash
# Apply all migrations
pnpm db:migrate:deploy
```

Alternatively (for development):
```bash
pnpm db:migrate
```

### 6.3 Seed Initial Data

```bash
pnpm db:seed
```

This creates:
- A singleton `Settings` row with default send schedule (Thursday 9:00 AM Istanbul time)
- 3 sample subscribers for testing

### 6.4 Verify Configuration

The worker will check that Settings exist at startup. Now start the web and worker:

```bash
pnpm dev
```

You should see:
- Web app listening on `http://localhost:3100`
- Worker logging `worker.settings.loaded` and `worker.ready`

Open the dashboard: **`http://localhost:3100`**

- If `AUTH_MODE=local`, log in with `ADMIN_EMAIL` and your password
- Navigate to **Settings** to review the configuration

### 6.5 Test Email Provider Configuration

From the **Settings** page, click **"Test Email Provider"** (or use the API endpoint `POST /api/admin/email/verify-config`).

You should see:
```json
{
  "ok": true,
  "detail": "ACS email configuration verified"
}
```

If this fails, double-check:
- `ACS_CONNECTION_STRING` and `ACS_SENDER_ADDRESS` in `.env`
- DNS/SPF/DKIM records for the sender domain
- ACS domain verification in Azure Portal

### 6.6 Send a Test Issue (Manual)

1. In the dashboard, go to **Archive**
2. Click **"Create test issue"** (if available), or use Prisma Studio to manually create an Issue + IssueItems
3. Set the issue to `draft`
4. Approve it and send to the test subscriber

You should receive the email within seconds. Check:
- Subject and preview text are in Turkish
- Buka dot-dissolve header is present
- Outlook/Gmail rendering is correct

---

## 7. Operating the Newsletter

### 7.1 Weekly Flow (Human-in-the-Loop)

Every week (by default Thursday at 9:00 AM Istanbul time), the **worker scheduler** runs the curation pipeline:

1. **Ingest stage:** Fetches articles from Exa + 9 RSS feeds
2. **Rank stage:** Scores articles by importance and relevance (Sonnet)
3. **Curate stage:** Picks top 2–3 unique, diverse items (Opus)
4. **Copywrite stage:** Writes Turkish marketing copy + subject line (Opus)
5. **QA stage:** Fact-checks and verifies Turkish grammar (Opus); retries copywrite if needed
6. **Render stage:** Generates branded HTML email
7. **Create Issue:** Creates a `draft` issue with the curated items

### 7.2 Human Review & Approval

1. Go to the dashboard **Archive** → **Drafts**
2. Open the newly created draft
3. **Live Preview:** See how it renders in email clients
4. **Edit:** Change copy, reorder items, or remove items if needed
5. **Approve:** Click **"Approve"** → issue moves to `in_review` → `approved`
6. **Schedule:** Click **"Schedule"** → issue moves to `scheduled`; worker will send on the scheduled time

### 7.3 Auto-Send Toggle

If you want to skip human approval on specific weeks (e.g., holidays), enable auto-send:

1. Go to **Settings**
2. Toggle **"Auto-send enabled"**
3. Set **"Auto-send kill-switch"** to `false` in environment

**Auto-send guardrails** (all must pass):
- At least 1 curated item in the draft
- QA flags are clear (no critical issues flagged)
- Email provider configuration is valid
- Subscriber count is within bounds (see `AUTOSEND_MIN_SUBSCRIBERS` and `AUTOSEND_MAX_SUBSCRIBERS`)
- The kill-switch is `false`

If any guardrail fails, the draft remains in `draft` status and an alert is logged.

### 7.4 Auto-Send Kill-Switch (Emergency)

If there is a problem (e.g., incorrect pricing config, test subscriber in production list), **immediately disable auto-send:**

```bash
# Set in environment
export AUTOSEND_KILL_SWITCH=true

# Restart worker
pkill -f "worker"
# or restart the Docker container
```

All auto-send checks will fail until `AUTOSEND_KILL_SWITCH=false`.

### 7.5 Switching Email Providers

To switch providers (e.g., from ACS to Resend) **without code changes:**

1. Update environment variables in `.env` to credentials for the new provider
2. Go to **Settings** → **Active email provider**
3. Change `activeProvider` from `acs_email` to `resend` (or `microsoft_graph`)
4. Click **"Test provider"** to verify credentials
5. Next send will use the new provider

Provider switch is instant and affects only new sends; already-sent issues are not re-sent.

### 7.6 Claude Pricing & Budget

The curation pipeline is cost-routed to different Claude models:

- **Rank stage:** `claude-sonnet-4-6` (cheaper)
- **Curate/Copywrite/QA stages:** `claude-opus-4-8` (more capable, pricier)

**Pricing config** is in `/packages/curation/src/pipeline/config.ts`:

```typescript
export const PRICING: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  'claude-sonnet-4-6': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
  },
  'claude-opus-4-8': {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
  },
};
```

**TODO (before production):** Confirm exact rates from https://www.anthropic.com/pricing. These are approximate for development.

Every pipeline run writes a `PipelineRun` row with actual token counts and calculated cost, so you can track spending.

---

## 8. Troubleshooting

### Email Provider Config Failures

**Error:** `"provider verifyConfig() failed"`

**Diagnosis:**
1. Check that environment variables are set (no typos, quotes, etc.)
2. Test credentials manually:
   - **ACS:** Try using `az communication email send` CLI
   - **Graph:** Use Graph Explorer (https://developer.microsoft.com/graph/graph-explorer)
   - **Resend:** Try the Resend dashboard test send
3. Check DNS records (SPF/DKIM/DMARC)

**Fix:**
- Update `.env` with correct credentials
- Restart worker (`pkill -f "worker"` or docker restart)
- Click **"Test provider"** again

### Auth UntrustedHost

**Error:** "UnauthorizedError: Untrusted Host"

**Cause:** The web app's `APP_BASE_URL` does not match the request origin. This is a security check.

**Fix:**
1. In `apps/web/.env`, verify `APP_BASE_URL` matches your actual deployment URL
2. If behind a proxy/load balancer, ensure `trustHost` is set correctly (already fixed in Phase 11)
3. Restart web app

### Draft Not Generated

**Error:** No draft appears in Archive after scheduled pipeline time

**Diagnosis:**
1. Check worker logs: `docker logs digest_worker` (if Docker)
2. Look for errors in ingest, rank, or curate stages
3. Check Settings: is the `sendDayOfWeek` and `sendTime` configured correctly?

**Common causes:**
- Worker is not running
- `ANTHROPIC_API_KEY` or `EXA_API_KEY` is missing/invalid
- Database connection is down
- Timezone mismatch: verify `timezone` in Settings matches your server's TZ

### Sends Failing or Bouncing

**Error:** Emails in `Send` table have status `failed` or `bounced`

**Diagnosis:**
1. Check the `error` field in `Send` rows (use Adminer or `SELECT * FROM sends WHERE status='failed'`)
2. Common errors:
   - `invalid_email`: Subscriber email is malformed
   - `daily_limit_exceeded`: Hit provider rate limit (too many sends too fast)
   - `domain_not_verified`: Email domain not yet verified in provider
3. Check provider dashboard for bounce/complaint feedback

**Fix:**
- For invalid emails: remove subscriber or fix email address
- For domain issues: verify DNS records are correct and propagated
- For rate limits: wait, then retry (automatic retry is implemented)
- For bounces: remove bounced subscribers (mark as `bounced` status)

---

## 9. Backup & Monitoring

### Database Backups

PostgreSQL is running in Docker with a named volume `digest_pgdata`. To back up:

```bash
# Export the database
docker exec digest_db pg_dump -U digest curated_ai_digest > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
docker exec -i digest_db psql -U digest curated_ai_digest < backup_20260617_093000.sql
```

### Monitoring

Key tables to monitor:

- **`pipeline_runs`** — Each curation run. Monitor for high costs or failures.
- **`issues`** — Check for stuck `in_review` or `scheduled` statuses.
- **`sends`** — Monitor for `failed` or `bounced` statuses.
- **`audit_logs`** — Track who approved/sent each issue.

### Logs

- **Web:** Check Docker logs: `docker logs digest_web`
- **Worker:** Check Docker logs: `docker logs digest_worker`
- **Database:** Check Adminer at `http://localhost:8080` (credentials: `digest` / `digest`)

---

## 10. Scaling & Production Considerations

### Docker Compose → Kubernetes

When ready to scale, consider:

1. **Database:** Migrate from Docker volume to a managed PostgreSQL service (Azure Database for PostgreSQL, AWS RDS, etc.)
2. **Web app:** Deploy as a stateless container; scale replicas
3. **Worker:** Run a single replica (scheduler is not distributed)
4. **Email:** Use ACS or Resend (not Graph, which has throttling)

### Rate Limiting & Throttling

- **Anthropic:** You have account-level rate limits. Monitor spending in the console.
- **Email providers:**
  - ACS: Generous limits; no per-request cost
  - Graph: 4 requests/second per tenant (not suitable for large lists)
  - Resend: Generous limits; charges per email

### Subscriber Management

- **Imports:** Use the Dashboard **Subscribers** page to bulk import via CSV
- **Unsubscribes:** Each email includes an unsubscribe link; unsubscribes are processed automatically
- **Bounces:** Monitor the `Send` table; mark bounced addresses as `bounced` to stop sending

---

## Appendix: Environment Variable Checklist

**Before first run, fill in:**

```bash
# apps/web/.env
✓ DATABASE_URL
✓ APP_BASE_URL
✓ AUTH_SECRET (run: openssl rand -base64 32)
✓ AUTH_MODE (local or entra)
✓ ADMIN_EMAIL (if AUTH_MODE=local)
✓ ADMIN_PASSWORD_HASH (if AUTH_MODE=local, run: node -e "require('argon2').hash('password').then(h=>console.log(h))")
✓ AUTH_MICROSOFT_ENTRA_ID_ID (if AUTH_MODE=entra)
✓ AUTH_MICROSOFT_ENTRA_ID_SECRET (if AUTH_MODE=entra)
✓ AUTH_MICROSOFT_ENTRA_ID_ISSUER (if AUTH_MODE=entra)
✓ AUTH_ALLOWED_TENANT_ID (if AUTH_MODE=entra)
✓ AUTH_ALLOWED_EMAIL_DOMAIN (if AUTH_MODE=entra)

# apps/worker/.env
✓ DATABASE_URL
✓ ANTHROPIC_API_KEY
✓ EXA_API_KEY
✓ APP_BASE_URL
✓ ACS_CONNECTION_STRING (if using ACS)
✓ ACS_SENDER_ADDRESS (if using ACS)
✓ GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_SENDER_ID (if using Graph)
✓ RESEND_API_KEY (if using Resend)
✓ AUTOSEND_MIN_SUBSCRIBERS (optional; default 1)
✓ AUTOSEND_MAX_SUBSCRIBERS (optional; default 50000)
✓ AUTOSEND_KILL_SWITCH (optional; default false)

# packages/db/.env
✓ DATABASE_URL

# packages/curation/.env
✓ ANTHROPIC_API_KEY
✓ EXA_API_KEY
✓ DATABASE_URL

# packages/email/.env
✓ EMAIL_PROVIDER
✓ ACS_CONNECTION_STRING, ACS_SENDER_ADDRESS (if using ACS)
✓ GRAPH_* (if using Graph)
✓ RESEND_API_KEY (if using Resend)
```

---

**End of Runbook**
