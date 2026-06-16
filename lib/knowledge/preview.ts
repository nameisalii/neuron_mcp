export interface KnowledgePreviewInput {
  id?: string
  content: string
  category: string
  aiSuggestedCategory?: string | null
  typeOverriddenByUser?: boolean | null
  source: string
  sourceUrl?: string | null
  sourceExternalId?: string | null
  owner?: string | null
  sourceCreatedAt?: string | null
  updatedAt?: string | null
  title?: string | null
  sourceLabels?: string[]
}

export interface KnowledgeMetadataChip {
  label: string
  value: string
  kind?: 'status' | 'priority' | 'team' | 'label' | 'date'
}

export interface KnowledgeDetail {
  label: string
  value: string
}

export interface KnowledgePreview {
  displayTitle: string
  displaySummary: string
  metadataChips: KnowledgeMetadataChip[]
  details: KnowledgeDetail[]
  githubLinks: string[]
  sourceLabel: string
  sourceActionLabel: string | null
  rawContent: string
}

const LINEAR_SECTION = /^(Description|Status|Project|Project description|Team|Assignee|Creator|Priority|Labels|Created|Updated|Completed|Canceled|Archived|Comments|Status history|Linear URL):\s*(.*)$/i
const DETAIL_FIELDS = new Set(['project', 'assignee', 'creator', 'created', 'updated', 'completed', 'canceled', 'archived', 'status history', 'comments'])

export function formatKnowledgeItemPreview(item: KnowledgePreviewInput): KnowledgePreview {
  const source = item.source.toLowerCase()
  if (source === 'linear') return formatLinearPreview(item)
  if (source === 'gmail') return formatGmailPreview(item)

  const sourceLabel = humanize(source)
  const cleaned = cleanMarkdown(item.content)
  const firstLine = cleaned.split('\n').find(Boolean) ?? `${sourceLabel} knowledge`
  const suppliedTitle = item.title?.trim()
  const hasMeaningfulTitle = Boolean(suppliedTitle && !['rule', 'decision', 'process', 'idea', 'plan', 'status_update', 'reference', 'fact', 'note'].includes(suppliedTitle.toLowerCase()))
  const displayTitle = hasMeaningfulTitle ? suppliedTitle! : firstLine.slice(0, 100)
  const remainder = cleaned.replace(firstLine, '').trim()

  return {
    displayTitle,
    displaySummary: truncate(hasMeaningfulTitle ? cleaned : remainder || `Relevant context from ${sourceLabel}.`, 240),
    metadataChips: [
      ...uniqueChips((item.sourceLabels ?? []).map((label) => ({ label: 'Label', value: label, kind: 'label' as const }))),
      ...(item.updatedAt ? [{ label: 'Updated', value: `Updated ${formatDate(item.updatedAt)}`, kind: 'date' as const }] : []),
    ],
    details: [
      ...(item.owner ? [{ label: 'Owner', value: item.owner }] : []),
      ...(item.sourceCreatedAt ? [{ label: 'Created', value: formatDate(item.sourceCreatedAt) }] : []),
    ],
    githubLinks: extractGithubLinks(item.content),
    sourceLabel,
    sourceActionLabel: item.sourceUrl ? `Open in ${sourceLabel}` : null,
    rawContent: stripRawUrls(item.content),
  }
}

function formatGmailPreview(item: KnowledgePreviewInput): KnowledgePreview {
  const cleaned = cleanMarkdown(item.content)
  const firstLine = cleaned.split('\n').find(Boolean) ?? 'Gmail message'
  const suppliedTitle = item.title?.trim()
  const displayTitle = suppliedTitle ? cleanMarkdown(suppliedTitle) : firstLine.slice(0, 110)
  const summarySeed = cleaned.replace(firstLine, '').trim() || cleaned
  const metadataChips = uniqueChips([
    ...(item.owner ? [{ label: 'Sender', value: item.owner, kind: 'label' as const }] : []),
    ...(item.sourceCreatedAt ? [{ label: 'Date', value: formatDate(item.sourceCreatedAt), kind: 'date' as const }] : []),
    ...((item.sourceLabels ?? [])
      .filter((label) => !isGenericCategory(label))
      .map((label) => ({ label: 'Label', value: label, kind: 'label' as const }))),
  ])

  return {
    displayTitle,
    displaySummary: truncate(summarySeed || `Relevant Gmail context.`, 240),
    metadataChips,
    details: [
      ...(item.owner ? [{ label: 'Sender', value: item.owner }] : []),
      ...(item.sourceCreatedAt ? [{ label: 'Received', value: formatDate(item.sourceCreatedAt) }] : []),
      ...(item.sourceExternalId ? [{ label: 'Thread', value: item.sourceExternalId }] : []),
    ],
    githubLinks: extractGithubLinks(item.content),
    sourceLabel: 'Gmail',
    sourceActionLabel: item.sourceUrl ? 'Open in Gmail' : null,
    rawContent: stripRawUrls(item.content),
  }
}

function formatLinearPreview(item: KnowledgePreviewInput): KnowledgePreview {
  const lines = item.content.split(/\r?\n/)
  const titleMatch = lines[0]?.match(/^Linear issue\s+([^:]+):\s*(.+)$/i)
  const identifier = titleMatch?.[1]?.trim()
  const issueTitle = cleanLinearTitle(titleMatch?.[2]?.trim().replace(/\s+(?:Description|Status|Team|Project|Assignee|Creator|Priority|Labels|Created|Updated):.*$/i, '') ?? item.title ?? 'Linear issue')
  const sections = parseLinearSections(lines.slice(1))
  const description = sections.get('description') ?? ''
  const labels = splitLabels(sections.get('labels'))
  const updated = sections.get('updated') ?? item.updatedAt ?? null
  const details: KnowledgeDetail[] = []

  for (const key of DETAIL_FIELDS) {
    const value = sections.get(key)
    if (value) details.push({ label: humanize(key), value: formatDetailValue(key, value) })
  }
  const checklist = extractChecklist(description)
  if (checklist) details.push({ label: 'Checklist', value: checklist })
  if (item.owner && !sections.get('assignee')) details.push({ label: 'Assignee', value: item.owner })

  const metadataChips: KnowledgeMetadataChip[] = [
    chip('Status', cleanParenthetical(sections.get('status')), 'status'),
    chip('Priority', usefulPriority(sections.get('priority')), 'priority'),
    chip('Team', cleanParenthetical(sections.get('team')), 'team'),
    ...labels.map((label) => ({ label: 'Label', value: label, kind: 'label' as const })),
    chip('Updated', updated ? `Updated ${formatDate(updated)}` : null, 'date'),
  ].filter((value): value is KnowledgeMetadataChip => Boolean(value))

  return {
    displayTitle: identifier ? `${identifier}: ${issueTitle}` : issueTitle,
    displaySummary: linearSummary(description, issueTitle, sections.get('status')),
    metadataChips,
    details,
    githubLinks: extractGithubLinks(item.content),
    sourceLabel: 'Linear',
    sourceActionLabel: item.sourceUrl ? 'Open in Linear' : null,
    rawContent: stripRawUrls(item.content),
  }
}

function parseLinearSections(lines: string[]): Map<string, string> {
  const sections = new Map<string, string>()
  let current: string | null = null
  for (const line of lines) {
    const match = line.match(LINEAR_SECTION)
    if (match) {
      current = match[1].toLowerCase()
      sections.set(current, match[2].trim())
    } else if (current) {
      sections.set(current, `${sections.get(current) ?? ''}\n${line}`.trim())
    }
  }
  return sections
}

function linearSummary(description: string, title: string, status?: string): string {
  const objective = extractMarkdownSection(description, 'Objective')
  const task = extractMarkdownSection(description, 'Task Description')
  const candidate = [objective, firstUsefulLine(task), firstUsefulParagraph(description)].find((value) => Boolean(value))
    ?? `${title}.${status ? ` Status: ${cleanParenthetical(status)}.` : ''}`
  return truncate(cleanMarkdown(candidate), 280)
}

function usefulPriority(value?: string): string | null {
  const priority = cleanParenthetical(value)
  return priority && !/^no priority$/i.test(priority) ? priority : null
}

function extractMarkdownSection(content: string, heading: string): string {
  const match = content.match(new RegExp(`\\*\\*${heading}:?\\*\\*\\s*([\\s\\S]*?)(?=\\n\\s*\\*\\*[^*]+:\\*\\*|\\n\\s*Checklist:|$)`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function firstUsefulLine(content: string): string {
  return content.split('\n').map(cleanMarkdown).find((line) => line.length > 20) ?? ''
}

function firstUsefulParagraph(content: string): string {
  return content
    .split(/\n\s*\n/)
    .map(cleanMarkdown)
    .find((paragraph) => paragraph.length > 20 && !/^(checklist|status history)/i.test(paragraph)) ?? ''
}

function cleanMarkdown(content: string): string {
  return content
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|mailto:)[^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*[-*]\s*\[[ xX]\]\s*/gm, '')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/[*_`#>]/g, '')
    .replace(/^(Issue|Objective|Task Description|Priority|Developer Action|Description):\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanLinearTitle(title: string): string {
  return cleanMarkdown(title).replace(/^(URGENT|HIGH PRIORITY|BLOCKER):\s*/i, '').replace(/[.\s]+$/, '').trim()
}

function cleanParenthetical(value?: string | null): string | null {
  if (!value) return null
  return value.replace(/\s*\([^)]*\)\s*$/, '').trim()
}

function splitLabels(value?: string): string[] {
  return value?.split(',').map((label) => label.trim()).filter(Boolean) ?? []
}

function isGenericCategory(label: string): boolean {
  return ['rule', 'decision', 'process', 'idea', 'plan', 'status_update', 'reference', 'fact', 'note'].includes(label.toLowerCase())
}

function chip(label: string, value: string | null, kind: KnowledgeMetadataChip['kind']): KnowledgeMetadataChip | null {
  return value ? { label, value, kind } : null
}

function formatDetailValue(key: string, value: string): string {
  if (['created', 'updated', 'completed', 'canceled', 'archived'].includes(key)) return formatDate(value)
  return stripRawUrls(cleanMarkdown(value))
}

function extractGithubLinks(content: string): string[] {
  return [...new Set(content.match(/https:\/\/github\.com\/[^\s)\]]+/gi) ?? [])]
}

function extractChecklist(content: string): string {
  const lines = content.split('\n').filter((line) => /^\s*[-*]\s*\[[ xX]\]/.test(line))
  return lines.map((line) => {
    const done = /\[[xX]\]/.test(line)
    return `${done ? 'Done' : 'Open'}: ${cleanMarkdown(line)}`
  }).join('\n')
}

function stripRawUrls(content: string): string {
  return content
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, (_, label: string) => /^https?:\/\//.test(label) ? '[link]' : label)
    .replace(/https?:\/\/\S+/g, '[link]')
}

export function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function humanize(value: string): string {
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value
  return `${value.slice(0, max - 3).trimEnd()}...`
}

function uniqueChips(chips: KnowledgeMetadataChip[]): KnowledgeMetadataChip[] {
  const seen = new Set<string>()
  const result: KnowledgeMetadataChip[] = []
  for (const chip of chips) {
    const key = `${chip.label}:${chip.value}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(chip)
  }
  return result
}
