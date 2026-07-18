import { z } from 'zod'

const RequiredText = z.string().trim().min(1)
const NumericUsdot = z.string().trim().regex(/^\d+$/)

export const FiveEldInputSchema = z.preprocess((value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const body = value as Record<string, unknown>
  return {
    companyId: body.companyId ?? body.companyID ?? body.company_id,
    usdot: body.usdot,
    apiKey: body.apiKey ?? body.api_key,
    providerToken: body.providerToken ?? body.provider_token,
  }
}, z.object({
  companyId: RequiredText,
  usdot: NumericUsdot,
  apiKey: RequiredText,
  providerToken: z.string().trim().optional().transform((value) => value || undefined),
}))

export type FiveEldInput = z.infer<typeof FiveEldInputSchema>

const fieldLabels: Record<string, string> = {
  companyId: 'Company ID',
  usdot: 'USDOT',
  apiKey: 'API key',
  providerToken: 'Provider token',
}

export function fiveEldValidationIssues(error: z.ZodError): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => {
    const field = String(issue.path[0] ?? 'request')
    const label = fieldLabels[field] ?? 'Field'
    const required = issue.code === 'invalid_type' || issue.code === 'too_small'
    return { field, message: required ? `${label} is required` : field === 'usdot' ? 'USDOT must be a numeric string' : `${label} is invalid` }
  })
}

export function fiveEldPresence(body: unknown) {
  const value = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {}
  const text = (input: unknown) => typeof input === 'string' ? input.trim() : ''
  const companyId = text(value.companyId ?? value.companyID ?? value.company_id)
  const usdot = text(value.usdot)
  const apiKey = text(value.apiKey ?? value.api_key)
  const providerToken = text(value.providerToken ?? value.provider_token)
  return { companyIdPresent: Boolean(companyId), usdotPresent: Boolean(usdot), apiKeyPresent: Boolean(apiKey), providerTokenPresent: Boolean(providerToken), companyIdLength: companyId.length, usdotLength: usdot.length, apiKeyLength: apiKey.length }
}
