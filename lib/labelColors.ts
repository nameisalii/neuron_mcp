export interface LabelMeta {
  bg: string
  text: string
  border: string
  activeBg: string
  displayName: string
}

export const LABEL_META: Record<string, LabelMeta> = {
  rule:         { bg: 'bg-blue-100',    text: 'text-blue-700',    border: 'border-blue-300',    activeBg: 'bg-blue-50',    displayName: 'Rule' },
  decision:     { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-300',  activeBg: 'bg-purple-50',  displayName: 'Decision' },
  idea:         { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300', activeBg: 'bg-emerald-50', displayName: 'Idea' },
  process:      { bg: 'bg-amber-100',   text: 'text-amber-700',   border: 'border-amber-300',   activeBg: 'bg-amber-50',   displayName: 'Process' },
  contact:      { bg: 'bg-pink-100',    text: 'text-pink-700',    border: 'border-pink-300',    activeBg: 'bg-pink-50',    displayName: 'Contact' },
  status:       { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-300',  activeBg: 'bg-orange-50',  displayName: 'Status' },
  reference:    { bg: 'bg-cyan-100',    text: 'text-cyan-700',    border: 'border-cyan-300',    activeBg: 'bg-cyan-50',    displayName: 'Reference' },
  fact:         { bg: 'bg-slate-100',   text: 'text-slate-700',   border: 'border-slate-300',   activeBg: 'bg-slate-50',   displayName: 'Fact' },
  note:         { bg: 'bg-gray-100',    text: 'text-gray-700',    border: 'border-gray-300',    activeBg: 'bg-gray-50',    displayName: 'Note' },
  context:      { bg: 'bg-gray-100',    text: 'text-gray-600',    border: 'border-gray-300',    activeBg: 'bg-gray-50',    displayName: 'Context' },
  meeting_note: { bg: 'bg-pink-100',    text: 'text-pink-700',    border: 'border-pink-300',    activeBg: 'bg-pink-50',    displayName: 'Meeting Note' },
  plan:         { bg: 'bg-cyan-100',    text: 'text-cyan-700',    border: 'border-cyan-300',    activeBg: 'bg-cyan-50',    displayName: 'Plan' },
  follow_up:    { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-300',  activeBg: 'bg-orange-50',  displayName: 'Follow-up' },
  status_update:{ bg: 'bg-sky-100',     text: 'text-sky-700',     border: 'border-sky-300',     activeBg: 'bg-sky-50',     displayName: 'Status Update' },
}

export function getLabelMeta(label: string): LabelMeta {
  return LABEL_META[label] ?? { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-300', activeBg: 'bg-gray-50', displayName: label }
}
