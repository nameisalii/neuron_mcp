import { z } from 'zod'

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0'

export class WhatsAppApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'WhatsAppApiError'
  }
}

const phoneNumberSchema = z
  .object({
    id: z.string().nullish(),
    display_phone_number: z.string().nullish(),
    verified_name: z.string().nullish(),
  })
  .passthrough()

export type WhatsAppPhoneNumber = z.infer<typeof phoneNumberSchema>

export async function getPhoneNumber(accessToken: string, phoneNumberId: string): Promise<WhatsAppPhoneNumber> {
  const params = new URLSearchParams({
    fields: 'display_phone_number,verified_name',
    access_token: accessToken,
  })
  const res = await fetch(`${GRAPH_API_BASE}/${encodeURIComponent(phoneNumberId)}?${params}`)
  if (res.status === 401 || res.status === 403) {
    throw new WhatsAppApiError('WhatsApp access token is invalid or lacks access', res.status)
  }
  if (!res.ok) {
    throw new WhatsAppApiError(`WhatsApp phone number lookup failed (${res.status})`, res.status)
  }
  return phoneNumberSchema.parse(await res.json())
}
