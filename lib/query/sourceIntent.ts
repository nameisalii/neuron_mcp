/**
 * Source intent detection for Query.
 *
 * DataTruck (TMS) and Five ELD are BOTH truck integrations but are separate
 * products with separate data. Answering a DataTruck question with Five ELD
 * data is a correctness bug, not a ranking nuisance — so DataTruck is matched
 * ahead of Five ELD and the tables below must stay disjoint.
 */

export type RequestedSource =
  | 'datatruck'
  | 'five_eld'
  | 'telegram'
  | 'slack'
  | 'gmail'
  | 'notion'
  | 'linear'
  | 'discord'
  | 'jira'
  | 'teams'
  | 'granola'
  | 'whatsapp'

export interface SourceIntent {
  requestedSource: RequestedSource | null
  confidence: number
  aliases: string[]
}

/** Confidence when the user named the product explicitly ("datatruck", "five eld"). */
const EXPLICIT_CONFIDENCE = 0.9
/** Confidence when only a generic domain alias matched ("orders", "gps"). */
const GENERIC_CONFIDENCE = 0.6
const NO_MATCH_CONFIDENCE = 0

/**
 * Ordered by match priority. DataTruck MUST precede Five ELD: the token "truck"
 * belongs to both vocabularies, and "data truck gps" is a DataTruck question
 * even though it contains a Five ELD alias.
 */
export const SOURCE_ALIASES: ReadonlyArray<readonly [RequestedSource, readonly string[]]> = [
  ['datatruck', [
    'datatruck',
    'data truck',
    'data-truck',
    'truck tms',
    'tms',
    'dispatch board',
    'work orders',
    'drivers list',
    'trucks list',
    'trailers list',
    'orders',
  ]],
  ['five_eld', [
    'five eld',
    'fiveeld',
    '5 eld',
    'tt eld',
    'tteld',
    'eld',
    'live gps',
    'gps',
    'hours of service',
    'hos',
    'truck assignments',
    'truck gps',
    'truck location',
    'driver location',
    'fleet location',
  ]],
  ['telegram', ['telegram bot', 'telegram channel', 'telegram messages', 'telegram', 'tg']],
  ['slack', ['slack']],
  ['gmail', ['gmail', 'email', 'emails']],
  ['notion', ['notion']],
  ['linear', ['linear']],
  ['discord', ['discord']],
  ['jira', ['jira']],
  ['teams', ['microsoft teams', 'ms teams', 'teams']],
  ['granola', ['granola']],
  ['whatsapp', ['whatsapp', 'whats app']],
] as const

/**
 * Sources whose vocabularies overlap and must never be returned together.
 * "data truck gps" contains a Five ELD alias but is a DataTruck question.
 */
export const MUTUALLY_EXCLUSIVE_SOURCES: ReadonlyArray<readonly [RequestedSource, RequestedSource]> = [
  ['datatruck', 'five_eld'],
] as const

/** Aliases that name a product outright, rather than describing its domain. */
const EXPLICIT_ALIASES = new Set([
  'datatruck', 'data truck', 'data-truck', 'truck tms',
  'five eld', 'fiveeld', '5 eld', 'tt eld', 'tteld',
  'telegram bot', 'telegram channel', 'telegram messages', 'telegram',
  'slack', 'gmail', 'notion', 'linear', 'discord',
])

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function aliasPattern(alias: string): RegExp {
  // Collapse authored whitespace into \s+ so "data truck" also matches "data  truck".
  const body = escapeRegExp(alias).replace(/\s+/g, '\\s+')
  return new RegExp(`\\b${body}\\b`, 'i')
}

function matchedAliases(normalized: string, aliases: readonly string[]): string[] {
  return aliases.filter((alias) => aliasPattern(alias).test(normalized))
}

/**
 * Returns the single source the user asked about, if any.
 *
 * Priority is table order (DataTruck first), NOT match length — a DataTruck
 * alias anywhere in the query wins outright.
 */
export function detectSourceIntent(query: string): SourceIntent {
  const normalized = query.toLowerCase()

  for (const [source, aliases] of SOURCE_ALIASES) {
    const hits = matchedAliases(normalized, aliases)
    if (hits.length === 0) continue

    const isExplicit = hits.some((alias) => EXPLICIT_ALIASES.has(alias))
    return {
      requestedSource: source,
      confidence: isExplicit ? EXPLICIT_CONFIDENCE : GENERIC_CONFIDENCE,
      aliases: hits,
    }
  }

  return { requestedSource: null, confidence: NO_MATCH_CONFIDENCE, aliases: [] }
}

/**
 * KnowledgeItem.source / sourceMetadata values that count as the given source.
 * Ingestion has written several spellings over time; retrieval must accept all.
 */
const SOURCE_MATCH_VALUES: Record<RequestedSource, readonly string[]> = {
  datatruck: ['datatruck', 'data_truck', 'data-truck'],
  five_eld: ['five_eld', 'fiveeld', 'tt_eld', 'tteld', 'eld'],
  telegram: ['telegram'],
  slack: ['slack'],
  gmail: ['gmail'],
  notion: ['notion'],
  linear: ['linear'],
  discord: ['discord'],
  jira: ['jira'],
  teams: ['teams', 'microsoft_teams'],
  granola: ['granola'],
  whatsapp: ['whatsapp'],
}

/**
 * All sources named by the query, with overlapping vocabularies resolved.
 * When two mutually-exclusive sources both match, the one listed first in
 * SOURCE_ALIASES wins (DataTruck before Five ELD).
 */
export function detectRequestedSources(query: string): RequestedSource[] {
  const normalized = query.toLowerCase()
  const matched = SOURCE_ALIASES
    .filter(([, aliases]) => matchedAliases(normalized, aliases).length > 0)
    .map(([source]) => source)

  return matched.filter((source) => !MUTUALLY_EXCLUSIVE_SOURCES.some(
    ([winner, loser]) => source === loser && matched.includes(winner)))
}

export function sourceMatchValues(source: RequestedSource): readonly string[] {
  return SOURCE_MATCH_VALUES[source]
}

/** True when a KnowledgeItem's source/metadata belongs to the requested source. */
export function itemMatchesSource(
  source: RequestedSource,
  itemSource: string | null | undefined,
  sourceMetadata?: Record<string, unknown> | null,
): boolean {
  const accepted = SOURCE_MATCH_VALUES[source]
  const candidates = [
    itemSource,
    sourceMetadata?.provider,
    sourceMetadata?.integration,
    sourceMetadata?.sourceType,
  ]

  return candidates.some((candidate) =>
    typeof candidate === 'string' && accepted.includes(candidate.toLowerCase()))
}
