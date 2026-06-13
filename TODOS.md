# TODOS

## Post-launch

### Pinecone namespace migration
**What:** Migrate all upsert/search calls from metadata filters to dual Pinecone namespaces (`team=workspaceId`, `personal=workspaceId:userId`).

**Why:** Enables personal-visibility chunks to be isolated at the vector layer. Today's metadata filter is correct but a filter bypass (Pinecone SDK bug, misconfiguration) could expose personal items. Namespace isolation is a hard boundary.

**Context:** This was the original design intent (see `docs/adr/0001-pinecone-namespace-isolation.md`). The current PR uses metadata filters because that's what the working code does. Migration requires re-upserting every vector in the index — risky to do pre-launch.

**Depends on:** Stable Pinecone index structure after Linear launch. Requires a one-time backfill script.

---

### Delete handling for Linear sync
**What:** Detect deleted Linear issues and remove their KnowledgeItems + Pinecone vectors.

**Why:** Deleted issues remain searchable indefinitely. Users who ask about old work may get answers based on issues that were later closed/deleted for good reason.

**Context:** Codex flagged this. The fix requires storing the Linear issue ID in KnowledgeItem (via `sourceUrl` or a new field), then on each sync diffing against Linear's `archivedAt`/`deletedAt`.

**Depends on:** Linear sync is live and stable.
