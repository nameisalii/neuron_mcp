import type { Week1ReportData } from './week1-report'
import { getAppUrl } from '@/lib/app-url'

function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function statRow(label: string, value: string | number): string {
  return `
    <tr>
      <td style="padding:6px 0;color:#6b7280;font-size:14px;">${esc(label)}</td>
      <td style="padding:6px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">${esc(String(value))}</td>
    </tr>`
}

export function renderWeek1Email(data: Week1ReportData, userName: string): string {
  const appUrl = getAppUrl()
  const dashboardUrl = `${appUrl}/dashboard`
  const greeting = userName ? `Hey ${esc(userName)}` : 'Hey'

  const topItemsHtml = data.topItems.length > 0
    ? data.topItems.map((item) => `
        <blockquote style="margin:0 0 12px 0;padding:12px 16px;background:#f9fafb;border-left:3px solid #e5e7eb;border-radius:4px;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">${esc(item.content)}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;">${esc(item.category)}</p>
        </blockquote>`).join('')
    : '<p style="color:#6b7280;font-size:14px;">No verified items yet — verify some in the Brain page.</p>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Your Week 1 Neuron Report</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:32px;border-bottom:1px solid #f3f4f6;">
              <p style="margin:0;font-size:13px;font-weight:600;color:#111827;letter-spacing:0.08em;text-transform:uppercase;">Neuron</p>
            </td>
          </tr>

          <!-- Opening -->
          <tr>
            <td style="padding:32px 0 24px;">
              <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#111827;line-height:1.3;">
                Here&rsquo;s what Neuron learned about how you work
              </h1>
              <p style="margin:0;font-size:15px;color:#4b5563;line-height:1.7;">
                ${greeting}, Neuron has been watching silently for 7 days. Here&rsquo;s what it found.
              </p>
            </td>
          </tr>

          <!-- Stats -->
          <tr>
            <td style="padding:24px;background:#f9fafb;border-radius:8px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                ${statRow('→ Knowledge items captured', data.knowledgeCount)}
                ${statRow('→ Decisions logged', data.decisionsCount)}
                ${statRow('→ Ideas surfaced', data.ideasCount)}
                ${statRow('→ Decisions without rationale', data.undocumentedDecisions)}
                ${statRow('→ Conflicts detected', data.conflicts)}
                ${statRow('→ Tokens saved (est.)', data.tokensSaved.toLocaleString())}
              </table>
            </td>
          </tr>

          <!-- Top items -->
          ${data.topItems.length > 0 ? `
          <tr>
            <td style="padding:32px 0 8px;">
              <h2 style="margin:0 0 16px;font-size:16px;font-weight:600;color:#111827;">Top verified items</h2>
              ${topItemsHtml}
            </td>
          </tr>` : ''}

          <!-- CTA -->
          <tr>
            <td style="padding:32px 0;">
              <a href="${esc(dashboardUrl)}"
                 style="display:inline-block;padding:12px 24px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
                View your company brain &rarr;
              </a>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:24px;border-top:1px solid #f3f4f6;">
              <p style="margin:0 0 8px;font-size:13px;color:#9ca3af;">&mdash; Neuron</p>
              <p style="margin:0;font-size:12px;color:#d1d5db;">
                You&rsquo;re receiving this because you signed up for Neuron.
                This is a one-time 7-day summary.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
