'use client'

import Link from 'next/link'
import type { SourceItem } from './SourceCard'

interface Props {
  text: string
  sources: SourceItem[]
}

const CITATION_RE = /\[Notion:\s*([^\]]+)\]/g

export default function CitationText({ text, sources }: Props) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(CITATION_RE.source, CITATION_RE.flags)

  while ((match = re.exec(text)) !== null) {
    const [full, rawTitle] = match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const title = rawTitle.trim()
    const source = sources.find((s) => s.pageTitle.toLowerCase() === title.toLowerCase())
    if (source) {
      parts.push(
        <Link
          key={match.index}
          href={`/dashboard/notion/${source.pageId}`}
          className="bg-blue-50 text-blue-700 px-1 rounded hover:bg-blue-100"
          title={source.content}
        >
          {full}
        </Link>,
      )
    } else {
      parts.push(full)
    }
    lastIndex = match.index + full.length
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return <span>{parts}</span>
}
