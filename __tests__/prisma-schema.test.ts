/**
 * @jest-environment node
 *
 * Prisma schema relationship tests.
 *
 * Strategy: parse schema.prisma as text and assert on the structural tokens
 * that encode relationships, constraints, and cascade rules.  No DB, no
 * prisma-engine binary, no version-sensitive internals API required.
 *
 * Each helper extracts the block for a named model then queries within it,
 * keeping assertions readable and tightly scoped.
 */

import * as fs from 'fs'
import * as path from 'path'

// ── load schema once ──────────────────────────────────────────────────────────

const SCHEMA_PATH = path.join(__dirname, '..', 'prisma', 'schema.prisma')
const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns the text content of a model block, e.g. everything between
 * `model Foo {` and its matching closing `}`.
 */
function modelBlock(name: string): string {
  const start = schema.indexOf(`model ${name} {`)
  if (start === -1) throw new Error(`Model "${name}" not found in schema`)

  let depth = 0
  let i = start
  while (i < schema.length) {
    if (schema[i] === '{') depth++
    else if (schema[i] === '}') {
      depth--
      if (depth === 0) return schema.slice(start, i + 1)
    }
    i++
  }
  throw new Error(`Unclosed block for model "${name}"`)
}

/** True when the model block contains the exact substring. */
function blockContains(modelName: string, substring: string): boolean {
  return modelBlock(modelName).includes(substring)
}

/** Returns all lines of a model block that contain the substring. */
function matchingLines(modelName: string, substring: string): string[] {
  return modelBlock(modelName)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.includes(substring))
}

// ── 1. User → Workspace: one-to-one (ownerId @unique) ────────────────────────

describe('User → Workspace: one-to-one', () => {
  it('Workspace.ownerId carries @unique', () => {
    const lines = matchingLines('Workspace', 'ownerId')
    expect(lines.some((l) => l.includes('@unique'))).toBe(true)
  })

  it('Workspace.owner is a relation to User', () => {
    const lines = matchingLines('Workspace', 'owner')
    // should have a line like: owner  User  @relation(...)
    expect(lines.some((l) => /owner\s+User/.test(l))).toBe(true)
  })

  it('Workspace.owner relation references ownerId', () => {
    const lines = matchingLines('Workspace', '@relation')
    expect(
      lines.some((l) => l.includes('ownerId') && l.includes('owner'))
    ).toBe(true)
  })

  it('User.workspace is optional (marked with ?)', () => {
    const lines = matchingLines('User', 'workspace')
    expect(lines.some((l) => /workspace\s+Workspace\?/.test(l))).toBe(true)
  })
})

// ── 2. Workspace → KnowledgeItem: cascade delete ─────────────────────────────

describe('Workspace → KnowledgeItem: cascade delete', () => {
  it('stores source timestamps and source external IDs for incremental integrations', () => {
    expect(blockContains('KnowledgeItem', 'sourceCreatedAt')).toBe(true)
    expect(blockContains('KnowledgeItem', 'sourceExternalId')).toBe(true)
  })

  it('stores visibility fields for team and personal scoping', () => {
    expect(blockContains('KnowledgeItem', 'visibility')).toBe(true)
    expect(blockContains('KnowledgeItem', 'visibilitySetBy')).toBe(true)
  })

  it('KnowledgeItem.workspace relation has onDelete: Cascade', () => {
    const lines = matchingLines('KnowledgeItem', '@relation')
    expect(
      lines.some((l) => l.includes('workspaceId') && l.includes('Cascade'))
    ).toBe(true)
  })

  it('KnowledgeItem.workspaceId is a required (non-optional) String field', () => {
    const lines = matchingLines('KnowledgeItem', 'workspaceId')
    // required field has no `?` after the type
    expect(lines.some((l) => /workspaceId\s+String(?!\?)/.test(l))).toBe(true)
  })

  it('Workspace.knowledgeItems is a list relation', () => {
    const lines = matchingLines('Workspace', 'knowledgeItems')
    expect(lines.some((l) => l.includes('KnowledgeItem[]'))).toBe(true)
  })
})

// ── 3. Workspace → Integration: @@unique([workspaceId, type]) ────────────────

describe('Workspace → Integration: compound unique constraint', () => {
  it('Integration model declares @@unique([workspaceId, type])', () => {
    const block = modelBlock('Integration')
    // normalise whitespace so spacing variations don't matter
    const normalised = block.replace(/\s+/g, ' ')
    expect(normalised).toMatch(/@@unique\(\[workspaceId,\s*type\]\)/)
  })

  it('Integration.workspace relation has onDelete: Cascade', () => {
    const lines = matchingLines('Integration', '@relation')
    expect(
      lines.some((l) => l.includes('workspaceId') && l.includes('Cascade'))
    ).toBe(true)
  })

  it('Integration.type is a required String (no ?)', () => {
    const lines = matchingLines('Integration', 'type')
    expect(lines.some((l) => /^\s*type\s+String(?!\?)/.test(l))).toBe(true)
  })
})

// ── 4. KnowledgeItem → Client: optional FK ───────────────────────────────────

describe('KnowledgeItem → Client: optional FK', () => {
  it('KnowledgeItem.clientId is an optional String field', () => {
    const lines = matchingLines('KnowledgeItem', 'clientId')
    expect(lines.some((l) => /clientId\s+String\?/.test(l))).toBe(true)
  })

  it('KnowledgeItem.client is an optional relation to Client', () => {
    const lines = matchingLines('KnowledgeItem', 'client')
    expect(lines.some((l) => /client\s+Client\?/.test(l))).toBe(true)
  })

  it('Client.knowledgeItems is a list back-relation', () => {
    const lines = matchingLines('Client', 'knowledgeItems')
    expect(lines.some((l) => l.includes('KnowledgeItem[]'))).toBe(true)
  })
})

// ── 5. All child models cascade-delete from Workspace ────────────────────────

describe('Cascade deletes from Workspace', () => {
  it.each(['KnowledgeItem', 'Decision', 'Idea', 'Client', 'Integration'])(
    '%s.workspace @relation carries onDelete: Cascade',
    (modelName) => {
      const lines = matchingLines(modelName, '@relation')
      expect(
        lines.some((l) => l.includes('workspaceId') && l.includes('Cascade'))
      ).toBe(true)
    }
  )
})
