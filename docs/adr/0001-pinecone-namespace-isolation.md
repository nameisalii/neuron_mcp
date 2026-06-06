# ADR-0001: Pinecone Namespace Isolation for Personal vs Team Knowledge

**Date**: 2026-05-31
**Status**: accepted
**Deciders**: Mukhammadzhon

## Context

Neuron stores vector embeddings in Pinecone for semantic search. The product supports two visibility levels for knowledge chunks: `personal` (only the owner can retrieve it) and `team` (all workspace members can retrieve it). The prior implementation used a single Pinecone namespace keyed to `workspaceId` and relied on metadata filters (`workspaceId` field) to scope results per workspace. As Neuron adds team collaboration and personal knowledge, metadata-based filtering alone is insufficient — a filter bug or missing field would silently surface one user's personal chunks in another user's query results.

## Decision

We use two distinct Pinecone namespaces per workspace:

- **Team knowledge**: `namespace = workspaceId`
- **Personal knowledge**: `namespace = workspaceId:userId`

On every query, we search both the team namespace and the requesting user's personal namespace, then merge and deduplicate results. Personal chunks belonging to other users in the same workspace are never included — this is enforced at the namespace level, not via metadata filter.

## Alternatives Considered

### Alternative 1: Single namespace with metadata filter
- **Pros**: Simpler — one Pinecone call per query, no merge step
- **Cons**: Metadata filters are soft guards; a missing or malformed `visibility` field silently leaks personal data across users
- **Why not**: Cross-user data leakage must be architecturally impossible, not just unlikely

### Alternative 2: Per-user namespaces only (no shared team namespace)
- **Pros**: Perfect isolation by default
- **Cons**: Team knowledge discovery requires searching all member namespaces — O(n members) Pinecone calls per query; no shared namespace means no single source of team truth
- **Why not**: Query latency and cost scale linearly with team size

### Alternative 3: Separate Pinecone index per workspace
- **Pros**: Strongest isolation at the infrastructure level
- **Cons**: Pinecone index creation is slow and costly; not viable for a free-tier solo user
- **Why not**: Over-engineered for the current scale; namespace isolation achieves the same safety guarantee within a single index

## Consequences

### Positive
- Cross-workspace and cross-user leakage is architecturally impossible — namespace boundaries are enforced by Pinecone, not application code
- Personal knowledge scales and is billed independently of team knowledge
- Solo users continue to use only the `workspaceId` namespace; the personal namespace is created on first personal chunk upsert

### Negative
- Every query requires two Pinecone calls (team + personal) and a client-side merge/dedup step
- Namespace key format (`workspaceId:userId`) must be generated consistently everywhere; any deviation silently loses or leaks vectors
- Solo-to-team upgrade requires a decision: personal vectors either stay in the personal namespace (correct, no migration) or are promoted to the team namespace (requires re-indexing)

### Risks
- **Namespace key inconsistency**: Mitigated by centralizing all namespace generation in a single utility function (`lib/pinecone.ts`) — never construct namespace strings inline
- **Query merge logic**: If the same chunk appears in both namespaces (e.g. a chunk re-indexed after visibility change), dedup by Pinecone vector ID before returning results
