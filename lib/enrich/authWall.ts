const AUTH_TEXT = /\b(sign in|log in|login|continue to|access denied|request access|you need permission|permission required)\b/i
const PROVIDER_AUTH = /\b(google docs|notion|figma|slack)\b.{0,80}\b(sign in|log in|login|permission)\b/i
const FORM_AUTH = /<(input|form)\b[^>]*(type=["']?(password|email)|name=["']?(password|email))/i

export function isAuthWall(input: {
  statusCode?: number
  title?: string
  markdown?: string
  html?: string
}): boolean {
  if (input.statusCode === 401 || input.statusCode === 403) return true
  const text = `${input.title ?? ''}\n${input.markdown ?? ''}`.slice(0, 8_000)
  if (AUTH_TEXT.test(text) || PROVIDER_AUTH.test(text)) return true
  const html = (input.html ?? '').slice(0, 20_000)
  return html.length < 20_000 && FORM_AUTH.test(html) && AUTH_TEXT.test(`${text}\n${html}`)
}
