# Deployment Guide

## Production Target

- GitHub repo: `nameisalii/neuron_mcp`
- Vercel root directory: repository root
- Build command: `npm run build`
- Install command: `npm install`
- Product domain: `app.tryneuron.net`
- Product sign-up: `https://app.tryneuron.net/sign-up`
- Product dashboard: `https://app.tryneuron.net/dashboard`

## Prerequisites
- Vercel account
- All third-party services configured (Clerk, Pinecone, Slack, Resend)

## Steps

### 1. Push to GitHub
```bash
git add .
git commit -m "feat: phase 5 — MCP server and Vercel deploy"
git push origin main
```

### 2. Import to Vercel
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import `nameisalii/neuron_mcp`
3. Framework: **Next.js** (auto-detected)
4. Click **Deploy** (will fail — env vars not set yet)

### 3. Add Environment Variables
In Vercel → Project → Settings → Environment Variables, add every key from `.env.production.example`:

| Key | Where to find it |
|---|---|
| `DATABASE_URL` | Your Postgres provider (Neon, Supabase, etc.) |
| `OPENAI_API_KEY` | platform.openai.com |
| `PINECONE_API_KEY` | app.pinecone.io |
| `PINECONE_INDEX` | Your index name in Pinecone |
| `CLERK_SECRET_KEY` | Clerk Dashboard → API Keys |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → API Keys |
| `CLERK_WEBHOOK_SECRET` | Clerk Dashboard → Webhooks |
| `NOTION_CLIENT_ID` | Notion integration OAuth client ID |
| `NOTION_CLIENT_SECRET` | Notion integration OAuth client secret |
| `SLACK_CLIENT_ID` | api.slack.com → Your App → OAuth |
| `SLACK_CLIENT_SECRET` | api.slack.com → Your App → OAuth |
| `SLACK_SIGNING_SECRET` | api.slack.com → Your App → Basic Info |
| `ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `RESEND_API_KEY` | resend.com → API Keys |
| `NEXT_PUBLIC_APP_URL` | `https://app.tryneuron.net` |
| `CRON_SECRET` | Any random string |
| `NEURON_API_KEY` | `openssl rand -hex 32` |
| `NEURON_WORKSPACE_ID` | From DB after first user signs up |

### 4. Update Slack OAuth Redirect URL
In api.slack.com → Your App → OAuth & Permissions → Redirect URLs:
- Add: `https://app.tryneuron.net/api/integrations/slack/callback`
- Remove or keep the localhost URL for dev

### 5. Update Clerk Webhook URL
In Clerk Dashboard → Webhooks:
- Add endpoint: `https://app.tryneuron.net/api/webhooks/clerk`
- Subscribe to: `user.created`

Use Clerk production keys in production:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...`
- `CLERK_SECRET_KEY=sk_live_...`
- `NEXT_PUBLIC_APP_URL=https://app.tryneuron.net`

Do not deploy production with `pk_test_...` or `sk_test_...` Clerk keys. In Clerk,
create or switch to the Production instance and allow `https://app.tryneuron.net`
as an origin/domain.

Configure these allowed Clerk redirect URLs:

- `https://app.tryneuron.net/onboarding`
- `https://app.tryneuron.net/dashboard`
- `https://app.tryneuron.net/sign-in`
- `https://app.tryneuron.net/sign-up`

Configure the Notion OAuth redirect URI as:

- Local: `http://localhost:3000/api/integrations/notion/callback`
- Production: `https://app.tryneuron.net/api/integrations/notion/callback`

Configure the remaining OAuth callbacks as:

- Gmail: `https://app.tryneuron.net/api/integrations/gmail/callback`
- Linear: `https://app.tryneuron.net/api/integrations/linear/callback`
- Slack: `https://app.tryneuron.net/api/integrations/slack/callback`

### 6. Redeploy
Vercel → Project → Deployments → Redeploy latest.

### 7. Set NEURON_WORKSPACE_ID
After first sign-up, find the workspace ID in your DB and add it to Vercel env vars. Then redeploy.
## Linear

Set `LINEAR_CLIENT_ID`, `LINEAR_CLIENT_SECRET`, `LINEAR_WEBHOOK_SECRET`,
`ENCRYPTION_KEY`, and `NEXT_PUBLIC_APP_URL=https://app.tryneuron.net`.

Configure the Linear OAuth callback as:

- Local: `http://localhost:3000/api/integrations/linear/callback`
- Production: `https://app.tryneuron.net/api/integrations/linear/callback`

Configure the Linear webhook URL as
`https://app.tryneuron.net/api/integrations/linear/webhook` and use the same secret
as `LINEAR_WEBHOOK_SECRET`.

The Linear OAuth application must allow the `read` scope. This grants read access
to the connected user's accessible issues, comments, teams, projects, and users.
Neuron enumerates every team returned for that user and does not require issues
to have descriptions.
