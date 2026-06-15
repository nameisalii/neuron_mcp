import type { DigestContent } from './generate'
import { getAppUrl } from '@/lib/app-url'

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function statRow(label: string, value: string | number): string {
  return `<tr>
    <td style="padding:6px 0;color:#6b7280;font-size:14px;">${esc(label)}</td>
    <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">${esc(String(value))}</td>
  </tr>`
}

export function renderDigestEmail(content: DigestContent, userName: string, type: 'daily' | 'weekly' = 'daily'): string {
  const appUrl = getAppUrl()
  const greeting = userName ? `Hey ${esc(userName)}` : 'Hey'
  const title = type === 'weekly' ? 'Your weekly Neuron digest' : 'Your daily Neuron digest'
  const period = type === 'weekly' ? '7 days' : '24 hours'

  const highlightsHtml = content.highlights.length > 0
    ? content.highlights.map((h) => `
      <blockquote style="margin:0 0 10px 0;padding:10px 14px;background:#f9fafb;border-left:3px solid #e5e7eb;border-radius:4px;">
        <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${esc(h.text)}</p>
      </blockquote>`).join('')
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 20px;">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">
  <tr><td style="padding-bottom:28px;border-bottom:1px solid #f3f4f6;">
    <p style="margin:0;font-size:13px;font-weight:600;color:#111827;letter-spacing:0.08em;text-transform:uppercase;">Neuron</p>
  </td></tr>
  <tr><td style="padding:28px 0 20px;">
    <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#111827;">${esc(title)}</h1>
    <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.7;">${greeting}, here&rsquo;s what happened in your workspace over the last ${period}.</p>
  </td></tr>
  <tr><td style="padding:4px 0 20px;">
    <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">${esc(content.summary)}</p>
  </td></tr>
  <tr><td style="padding:20px;background:#f9fafb;border-radius:8px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      ${statRow('Items captured', content.stats.synced)}
      ${statRow('Chunks updated', content.stats.labeled)}
      ${statRow('Queries asked', content.stats.queries)}
      ${statRow('Unresolved alerts', content.stats.alerts)}
    </table>
  </td></tr>
  ${highlightsHtml ? `<tr><td style="padding:24px 0 8px;"><h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">Highlights</h2>${highlightsHtml}</td></tr>` : ''}
  <tr><td style="padding:28px 0;">
    <a href="${esc(appUrl + '/dashboard/digest')}" style="display:inline-block;padding:12px 24px;background:#111827;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">View full digest &rarr;</a>
  </td></tr>
  <tr><td style="padding-top:20px;border-top:1px solid #f3f4f6;">
    <p style="margin:0;font-size:12px;color:#d1d5db;">You&rsquo;re receiving this because email digest is enabled in your Neuron preferences.</p>
  </td></tr>
</table></td></tr></table>
</body></html>`
}
