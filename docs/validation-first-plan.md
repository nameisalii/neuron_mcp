# Validation-first technical plan

Neuron is operating in a 30-day validation window. The primary signal is whether a design-partner team returns and uses Neuron in week four without prompting from Ali. Product work should remain limited to retention instrumentation, onboarding proof, and answer trust until that signal exists.

## Current validation instrumentation

- `ActivityEvent` records safe `query`, `query_failed`, `save_decision`, `onboarding_question_answered`, and `onboarding_completed` events.
- Activity shows current-workspace validation signals. It intentionally does not expose message or query content.
- Onboarding is complete only after three answers with sources. Activity events are the progress ledger during validation.
- `ACTIVITY_TRACKING_STRICT=true` makes failed validation writes visible to callers. The default remains non-blocking.

## Deferred blocker: MCP authentication

`validateApiKey` currently reads the single `NEURON_API_KEY` and `NEURON_WORKSPACE_ID` pair. This is single-tenant and should only be used with isolated design partners.

The future implementation needs an `ApiKey` table with a hashed key, workspace lookup, per-workspace keys, revocation, `lastUsedAt`, and scopes. Do not expand shared MCP access before this exists.

## Deferred blocker: Pinecone team isolation

Personal vectors already use the `workspaceId:userId` namespace pattern. Team search currently uses the shared/default namespace with a required `workspaceId` metadata filter.

The future migration must:

1. Put team vectors in a `workspaceId` namespace.
2. Update every upsert, search, and delete path consistently.
3. Migrate existing vectors without widening access.
4. Add tests proving one workspace cannot retrieve another workspace’s vectors.

## Validation operating decision

Run design partners one at a time or in otherwise isolated environments until retention is proven. Multi-tenant hardening remains a launch blocker, not a validation-window feature.
