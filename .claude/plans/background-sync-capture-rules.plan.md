# Plan: Background Sync & Capture Rules System

**Complexity**: Large (21 files, 3 schema models, 6 API routes, 1 cron, 1 webhook, 1 settings UI)

---

## Summary

Adds continuous background knowledge capture to Neuron: Notion pages are polled every 5 minutes via Vercel Cron; Slack messages arrive via the Events API webhook. Both paths run through a capture-rules engine that evaluates each item against workspace-level include/exclude preferences before extraction. Workspace admins configure and audit rules via a new settings page at `/dashboard/settings/capture`.

---

## Pattern Grounding

| Category | Source | Pattern |
|---|---|---|
| Cron auth | `app/api/cron/week1/route.ts:10-21` | `validateCronSecret` with `timingSafeEqual` on `x-cron-secret` header |
| Webhook sig | `app/api/webhooks/clerk/route.ts:7-31` | Read raw body as text, verify with library/HMAC before parsing JSON |
| Route auth | `app/api/notion/chunks/[chunkId]/labels/route.ts:9-36` | `auth()` → `findUnique(user)` → `findUnique(member)` → `ALLOWED_ROLES.has(role)` |
| Admin gate | `app/api/notion/chunks/[chunkId]/labels/route.ts:9` | `new Set(['owner', 'admin', 'member'])` — restrict write ops to `new Set(['owner', 'admin'])` |
| Zod input | `app/api/query/route.ts:14-16` | `z.object(…)` + `safeParse` + `if (!parsed.success) return 400` |
| Error handling | `app/api/integrations/notion/sync/route.ts:63-65` | `console.error('[prefix]', err)` → `NextResponse.json({ error: '…' }, { status: 500 })` |
| Activity log | `lib/activity.ts:6-21` | `void trackEvent(…)` fire-and-forget, never throws |
| Env validation | `lib/env.ts:1-27` | `REQUIRED_VARS` array + `validateEnv()`, skip in `test` |
| Server/client split | `app/(dashboard)/dashboard/settings/team/` | `page.tsx` (server, data fetch + serialize) + `*Client.tsx` (`'use client'`, all state) |
| Test style | `lib/notion/__tests__/sync.test.ts:1-10` | `/** @jest-environment node */`, `jest.mock` blocks, `jest.mocked`, `beforeEach(jest.clearAllMocks)` |
| upsert pattern | `app/api/integrations/notion/sync/route.ts:41-45` | `prisma.*.upsert({ where: unique, create: {…}, update: {…} })` |

---

## Files to Change

| File | Action | Why |
|---|---|---|
| `prisma/schema.prisma` | UPDATE | Add `CaptureRule`, `CaptureLog`, `SyncStatus` models |
| `lib/env.ts` | UPDATE | Add `CRON_SECRET` to `REQUIRED_VARS` |
| `vercel.json` | UPDATE | Add `crons` array + `maxDuration` for sync-notion route |
| `lib/sync/capture-rules.ts` | CREATE | Capture evaluation engine |
| `lib/sync/__tests__/capture-rules.test.ts` | CREATE | Unit tests for evaluation logic |
| `lib/sync/background.ts` | CREATE | Notion background sync + Slack message processor |
| `lib/sync/__tests__/background.test.ts` | CREATE | Unit tests for both sync paths |
| `app/api/cron/sync-notion/route.ts` | CREATE | GET handler; iterates active workspaces, calls background.ts |
| `app/api/cron/sync-notion/__tests__/route.test.ts` | CREATE | Tests: secret validation, workspace iteration, error isolation |
| `app/api/integrations/slack/events/route.ts` | CREATE | POST; HMAC verify, URL challenge, fire-and-forget processing |
| `app/api/integrations/slack/events/__tests__/route.test.ts` | CREATE | Tests: sig rejection, challenge response, message routing |
| `app/api/settings/capture-rules/route.ts` | CREATE | GET (list) + POST (create, admin/owner) |
| `app/api/settings/capture-rules/__tests__/route.test.ts` | CREATE | Tests: list, create, role guard |
| `app/api/settings/capture-rules/[ruleId]/route.ts` | CREATE | DELETE (admin/owner) |
| `app/api/settings/capture-rules/[ruleId]/__tests__/route.test.ts` | CREATE | Tests: delete, 404, role guard |
| `app/api/settings/capture-log/route.ts` | CREATE | GET paginated with status/source filters |
| `app/api/settings/capture-log/__tests__/route.test.ts` | CREATE | Tests: pagination, filter, auth |
| `app/api/settings/sync-status/route.ts` | CREATE | PATCH (upsert mode/status, admin/owner) |
| `app/api/settings/sync-status/__tests__/route.test.ts` | CREATE | Tests: upsert, pause/resume, role guard |
| `app/(dashboard)/dashboard/settings/capture/page.tsx` | CREATE | Server component: auth + data fetch + render client |
| `app/(dashboard)/dashboard/settings/capture/CaptureSettingsClient.tsx` | CREATE | `'use client'` full settings UI |

---

## Phase 1 — Schema

### Task 1.1 — Add models to `prisma/schema.prisma`

```prisma
model CaptureRule {
  id          String      @id @default(cuid())
  workspaceId String
  workspace   Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  integration String      // "notion" | "slack"
  ruleType    String      // "include" | "exclude"
  target      String      // pageId, channelId, or keyword pattern
  targetName  String      // human-readable label
  createdBy   String      // Clerk userId — ATTRIBUTION
  createdAt   DateTime    @default(now())
  captureLogs CaptureLog[]

  @@index([workspaceId])
  @@index([workspaceId, integration])
}

model CaptureLog {
  id             String       @id @default(cuid())
  workspaceId    String
  workspace      Workspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  timestamp      DateTime     @default(now())
  source         String       // "notion" | "slack"
  sourceId       String       // pageId or channelId
  contentPreview String       // first 50 chars
  status         String       // "captured" | "skipped" | "excluded"
  reason         String
  captureRuleId  String?      // nullable — system default captures have no rule
  captureRule    CaptureRule? @relation(fields: [captureRuleId], references: [id], onDelete: SetNull)

  @@index([workspaceId])
  @@index([workspaceId, timestamp])
  @@index([workspaceId, source])
  @@index([workspaceId, status])
}

model SyncStatus {
  id            String    @id @default(cuid())
  workspaceId   String
  workspace     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  integration   String    // "notion" | "slack"
  mode          String    @default("manual")   // "manual" | "background"
  lastSyncAt    DateTime?
  nextSyncAt    DateTime?
  status        String    @default("active")   // "active" | "paused" | "error"
  errorMessage  String?
  configuredBy  String    // Clerk userId — ATTRIBUTION

  @@unique([workspaceId, integration])
  @@index([workspaceId])
  @@index([integration, mode, status])  // used by cron to find active workspaces
}
```

Add `CaptureRule[]`, `CaptureLog[]`, `SyncStatus[]` relations to the `Workspace` model.

**Validate**: `npx prisma validate && npx prisma migrate dev --name add_capture_models`

---

## Phase 2 — Capture Rules Engine

### Task 2.1 — `lib/sync/capture-rules.ts`

```typescript
// Types
export interface CaptureItem {
  integration: 'notion' | 'slack'
  sourceId: string         // Notion pageId or Slack channelId
  contentPreview: string   // first 50 chars of content
}

export interface CaptureDecision {
  decision: 'capture' | 'skip' | 'exclude'
  reason: string
  ruleId?: string
}
```

**Evaluation logic** (in this priority order):

1. Load all `CaptureRule` rows for `{ workspaceId, integration }` ordered by `createdAt asc`
2. If `rules.length === 0` → `{ decision: 'capture', reason: 'no_rules_configured' }`
3. Check `exclude` rules first — iterate; if `matchesRule(rule, item)` → `{ decision: 'exclude', reason: 'excluded_by_rule:{targetName}', ruleId: rule.id }`
4. Filter to `include` rules; if none exist → `{ decision: 'capture', reason: 'no_include_rules_configured' }`
5. Check `include` rules — if any match → `{ decision: 'capture', reason: 'included_by_rule:{targetName}', ruleId: rule.id }`
6. Fall through → `{ decision: 'skip', reason: 'no_include_rule_matched' }`

**`matchesRule(rule, item)`**:
- If `rule.target === item.sourceId` → `true` (exact ID match — for pageId / channelId rules)
- If `item.contentPreview.toLowerCase().includes(rule.target.toLowerCase())` → `true` (keyword rules)
- Otherwise `false`

Export: `evaluateCapture(workspaceId: string, item: CaptureItem): Promise<CaptureDecision>`

**Validate**: `npx jest lib/sync --no-coverage`

### Task 2.2 — `lib/sync/__tests__/capture-rules.test.ts`

Cover:
- No rules → always capture
- Exclude rule matching sourceId blocks item
- Include rule matching sourceId captures item
- Include rules present but none match → skip
- Exclude takes priority over matching include
- Keyword matching on contentPreview
- `captureRuleId` present in decision when rule matched, absent when no rule

---

## Phase 3 — Background Sync Service

### Task 3.1 — `lib/sync/background.ts`

**Export 1: `runNotionBackgroundSync(workspaceId: string): Promise<SyncResult>`**

```
1. Load SyncStatus for (workspaceId, 'notion')
2. If status === 'paused' → return early with { pages:0, chunks:0, skipped:0, failed:[] }
3. Determine sinceDate: syncStatus.lastSyncAt ?? 5 min ago
4. Build Notion client from NOTION_TOKEN
5. Search with: { filter: { property: 'object', value: 'page' },
                   sort: { timestamp: 'last_edited_time', direction: 'descending' } }
   — Notion's search API does NOT support timestamp filtering server-side;
     filter client-side: skip pages where last_edited_time <= sinceDate
6. For each page:
   a. Build CaptureItem { integration:'notion', sourceId:page.id, contentPreview: title.slice(0,50) }
   b. Call evaluateCapture(workspaceId, item)
   c. Write CaptureLog entry regardless of decision (captured/skipped/excluded)
   d. If decision === 'capture': reuse existing syncNotionPages page-level logic
      (fetch blocks → extract chunks → upsert page → createMany chunks → upsert embeddings)
      Attribution: syncedBy = syncStatus.configuredBy (the user who enabled background sync)
7. Upsert SyncStatus: { lastSyncAt: now, nextSyncAt: now + 5min, status: 'active' }
8. Return SyncResult
```

**Export 2: `processSlackMessage(workspaceId: string, event: SlackMessageEvent): Promise<void>`**

```typescript
interface SlackMessageEvent {
  channel: string   // channelId
  user: string      // Slack userId
  text: string
  ts: string
}
```

```
1. Check SyncStatus for (workspaceId, 'slack'); skip if paused
2. Build CaptureItem { integration:'slack', sourceId:event.channel, contentPreview:event.text.slice(0,50) }
3. evaluateCapture(workspaceId, item)
4. Write CaptureLog
5. If captured: extractKnowledge([message], workspaceId) — reuse existing extractor
6. Update SyncStatus.lastSyncAt
```

**Validate**: `npx jest lib/sync --no-coverage`

### Task 3.2 — `lib/sync/__tests__/background.test.ts`

Mock: `@notionhq/client`, `@/lib/db` (prisma), `@/lib/openai`, `@/lib/pinecone`, `@/lib/extraction/extractor`, `./capture-rules`

Cover:
- Paused SyncStatus → early return, no Notion API call
- Pages newer than sinceDate are processed; older pages are skipped
- `evaluateCapture` called for each page candidate
- `CaptureLog` created for each item regardless of decision
- `SyncStatus` upserted with updated timestamps after run
- `processSlackMessage` skips if SyncStatus paused
- `processSlackMessage` calls `extractKnowledge` only when decision === 'capture'

---

## Phase 4 — API Routes

### Task 4.1 — `app/api/settings/capture-rules/route.ts`

**GET** — list rules for the caller's workspace (all authenticated members)
```
→ 200 { data: CaptureRule[], meta: { total } }
```

**POST** — create a rule (admin/owner only)
```typescript
const CreateRuleSchema = z.object({
  integration: z.enum(['notion', 'slack']),
  ruleType: z.enum(['include', 'exclude']),
  target: z.string().min(1).max(500),
  targetName: z.string().min(1).max(200),
})
```
Stores `createdBy: userId` from Clerk session.
```
→ 201 { data: CaptureRule }
```

### Task 4.2 — `app/api/settings/capture-rules/[ruleId]/route.ts`

**DELETE** — admin/owner only; 404 if rule not in caller's workspace
```
→ 200 { success: true }
```

### Task 4.3 — `app/api/settings/capture-log/route.ts`

**GET** — paginated log (all authenticated members can read)

Query params (validated with Zod):
- `page` (default 1), `limit` (default 20, max 100)
- `status` (`captured | skipped | excluded | all`, default `all`)
- `source` (`notion | slack | all`, default `all`)

```
→ 200 { data: CaptureLog[], meta: { total, page, limit } }
```

### Task 4.4 — `app/api/settings/sync-status/route.ts`

**PATCH** — upsert SyncStatus; admin/owner only

```typescript
const SyncStatusSchema = z.object({
  integration: z.enum(['notion', 'slack']),
  mode: z.enum(['manual', 'background']).optional(),
  status: z.enum(['active', 'paused']).optional(),
})
```

Upserts on `(workspaceId, integration)`. Stores `configuredBy: userId`. When mode switches to `'background'`, sets `nextSyncAt = now + 5 min`. Clears `errorMessage` when status set to `'active'`.

```
→ 200 { data: SyncStatus }
```

### Task 4.5 — `app/api/integrations/slack/events/route.ts`

**POST** — Slack Events API webhook

```
1. Read raw body as text (req.text()) — must precede any JSON parsing
2. Verify HMAC-SHA256 signature:
   - sigBase = `v0:${x-slack-request-timestamp}:${rawBody}`
   - expected = `v0=${hmac(SLACK_SIGNING_SECRET, sigBase, 'hex')}`
   - timingSafeEqual comparison
   - Reject requests where |now - timestamp| > 300s (replay protection)
3. Parse JSON
4. If payload.type === 'url_verification' → return { challenge: payload.challenge }
5. If payload.type === 'event_callback' && event.type === 'message' && !event.subtype:
   a. Look up workspace via team_id: prisma.integration.findFirst({ where: { type:'slack', teamId:payload.team_id } })
   b. If workspace found: void processSlackMessage(workspaceId, event)
6. Return 200 { ok: true }
```

Signature helper (inline, mirrors `validateCronSecret` pattern but uses `createHmac`):
```typescript
import { createHmac, timingSafeEqual } from 'crypto'

function verifySlackSignature(rawBody: string, timestamp: string, sig: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret) return false
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp, 10)) > 300) return false
  const expected = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex')}`
  const a = Buffer.from(expected)
  const b = Buffer.from(sig.padEnd(expected.length, '\0').slice(0, expected.length))
  return a.length === b.length && timingSafeEqual(a, b)
}
```

### Task 4.6 — `app/api/cron/sync-notion/route.ts`

**GET** — validated with existing `validateCronSecret` helper (copy inline, same pattern as week1)

```
1. Validate x-cron-secret header with timingSafeEqual
2. Query: prisma.syncStatus.findMany({ where: { integration:'notion', mode:'background', status:'active' } })
3. For each: try { await runNotionBackgroundSync(ws.workspaceId); processed++ }
             catch { log error; upsert SyncStatus to { status:'error', errorMessage } }
4. Return { processed, total: syncStatuses.length }
```

**Validate for all routes**: `npx jest app/api/settings app/api/integrations/slack/events app/api/cron/sync-notion --no-coverage`

---

## Phase 5 — Infrastructure Updates

### Task 5.1 — `lib/env.ts`

Add `'CRON_SECRET'` to `REQUIRED_VARS`.

### Task 5.2 — `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-notion",
      "schedule": "*/5 * * * *"
    }
  ],
  "functions": {
    "app/api/cron/sync-notion/route.ts": {
      "maxDuration": 120
    },
    "app/api/integrations/slack/sync/route.ts": {
      "maxDuration": 60
    },
    "app/api/query/route.ts": {
      "maxDuration": 30
    }
  }
}
```

---

## Phase 6 — Capture Settings UI

### Task 6.1 — `app/(dashboard)/dashboard/settings/capture/page.tsx` (server)

Fetch in parallel:
```typescript
const [notionRules, slackRules, notionStatus, slackStatus, recentLogs, members, integration] =
  await Promise.all([
    prisma.captureRule.findMany({ where: { workspaceId, integration: 'notion' } }),
    prisma.captureRule.findMany({ where: { workspaceId, integration: 'slack' } }),
    prisma.syncStatus.findUnique({ where: { workspaceId_integration: { workspaceId, integration: 'notion' } } }),
    prisma.syncStatus.findUnique({ where: { workspaceId_integration: { workspaceId, integration: 'slack' } } }),
    prisma.captureLog.findMany({ where: { workspaceId }, orderBy: { timestamp: 'desc' }, take: 20 }),
    prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true, displayName: true } }),
    prisma.integration.findUnique({ where: { workspaceId_type: { workspaceId, type: 'slack' } }, select: { channels: true, metadata: true } }),
  ])
```

Build `memberMap: Record<string, string>` from `members`. Serialize all dates to ISO strings. Pass everything to `<CaptureSettingsClient>`.

### Task 6.2 — `app/(dashboard)/dashboard/settings/capture/CaptureSettingsClient.tsx` (client)

**Tab structure**: `'Notion' | 'Slack' | 'Capture Log'`

**Notion tab**:
- Tree view of NotionPage records grouped by `parentPageId`; each row has a checkbox
- Checking a page creates a `include` rule via `POST /api/settings/capture-rules`
- Unchecking deletes the rule via `DELETE /api/settings/capture-rules/[ruleId]`
- Attribution below each active rule: `"Configured by {memberMap[rule.createdBy]}"`
- "Pause Notion capture" toggle → `PATCH /api/settings/sync-status { integration:'notion', status:'paused'|'active' }`
- Background sync toggle → `PATCH /api/settings/sync-status { integration:'notion', mode:'background'|'manual' }`
- Shows `SyncStatus.lastSyncAt` and `nextSyncAt`

**Slack tab**:
- Channel list from `integration.channels`; each has a toggle (include/exclude rule)
- Same attribution + pause/resume pattern

**Capture Log tab**:
- Table: timestamp | source | contentPreview | status badge | reason
- Filter buttons: All / Captured / Skipped / Excluded
- Status badge colors: captured=green, skipped=gray, excluded=red
- Pagination (load more)

**Privacy summary** (always visible):
- "Notion: {N} pages in capture scope"
- "Slack: {M} channels in capture scope"
- "Last sync: {relative time}"

**State management**:
```typescript
const [notionRules, setNotionRules] = useState(initialNotionRules)
const [slackRules, setSlackRules] = useState(initialSlackRules)
const [notionStatus, setNotionStatus] = useState(initialNotionStatus)
const [slackStatus, setSlackStatus] = useState(initialSlackStatus)
const [logs, setLogs] = useState(initialLogs)
const [logFilter, setLogFilter] = useState<'all'|'captured'|'skipped'|'excluded'>('all')
const [saving, setSaving] = useState<string | null>(null) // ruleId being toggled
```

**Error pattern**: same as TeamPageClient — inline error string state, no toast library.

---

## Validation

```bash
# Schema
npx prisma validate
npx prisma migrate dev --name add_capture_models

# Unit tests
npx jest lib/sync --no-coverage

# API route tests
npx jest app/api/settings app/api/integrations/slack/events app/api/cron --no-coverage

# Full test suite (must not regress)
npx jest --no-coverage

# TypeScript
npx tsc --noEmit
```

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Notion search API does not support server-side timestamp filtering | High | Client-side filter: compare `last_edited_time` to `sinceDate` after fetching; no behavior change, minor over-fetching |
| Slack event processing exceeds 3-second Slack timeout | Medium | Fire-and-forget with `void`; Fluid Compute keeps instance alive; Slack retries on timeout |
| Vercel Cron invokes cron while previous run is still processing | Low | `SyncStatus.status = 'running'` guard at start of `runNotionBackgroundSync`; skip if already running |
| `CRON_SECRET` not set in production breaks env validation at boot | Medium | Add to `.env.example`; document in deployment notes |
| Slack signature replay: stale timestamp | Mitigated | 5-minute window enforced in `verifySlackSignature` |
| `CaptureLog` table grows unbounded | Low | Add a scheduled cleanup cron (out of scope for this phase; log it as tech debt) |

---

## Acceptance Criteria

- [ ] Schema migrates cleanly; `npx prisma validate` passes
- [ ] `evaluateCapture` returns `exclude` before `skip` before `capture`
- [ ] Notion cron rejects requests without valid `CRON_SECRET`
- [ ] Slack events rejected without valid HMAC signature
- [ ] `POST /api/settings/capture-rules` returns 403 for `member` role
- [ ] `SyncStatus` upserted on `(workspaceId, integration)` — no duplicate rows
- [ ] Capture log written for every evaluated item, regardless of decision
- [ ] Attribution ("Configured by Ali") appears on every rule card in the UI
- [ ] All 7 new test files pass; existing test suite unaffected
- [ ] `npx tsc --noEmit` introduces no new errors
