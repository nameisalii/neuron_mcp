import { z } from 'zod'
import type { SlackMessage } from '@/types'

const textSchema = z.object({ body: z.string().nullish() }).passthrough()
const messageSchema = z
  .object({
    id: z.string(),
    from: z.string().nullish(),
    timestamp: z.string().nullish(),
    type: z.string().nullish(),
    text: textSchema.nullish(),
    button: z.object({ text: z.string().nullish() }).passthrough().nullish(),
    interactive: z
      .object({
        button_reply: z.object({ title: z.string().nullish() }).passthrough().nullish(),
        list_reply: z.object({ title: z.string().nullish() }).passthrough().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough()

const changeValueSchema = z
  .object({
    messaging_product: z.string().nullish(),
    metadata: z.object({ phone_number_id: z.string().nullish(), display_phone_number: z.string().nullish() }).passthrough().nullish(),
    contacts: z.array(z.object({ wa_id: z.string().nullish(), profile: z.object({ name: z.string().nullish() }).passthrough().nullish() }).passthrough()).nullish(),
    messages: z.array(messageSchema).nullish(),
  })
  .passthrough()

const payloadSchema = z
  .object({
    object: z.string().nullish(),
    entry: z.array(z.object({
      changes: z.array(z.object({ value: changeValueSchema }).passthrough()).nullish(),
    }).passthrough()).nullish(),
  })
  .passthrough()

export interface WhatsAppInboundMessage {
  id: string
  phoneNumberId: string
  from: string
  senderName: string
  text: string
  timestamp: Date | null
}

function messageText(message: z.infer<typeof messageSchema>): string {
  if (message.text?.body?.trim()) return message.text.body.trim()
  if (message.button?.text?.trim()) return message.button.text.trim()
  const buttonTitle = message.interactive?.button_reply?.title
  if (buttonTitle?.trim()) return buttonTitle.trim()
  const listTitle = message.interactive?.list_reply?.title
  if (listTitle?.trim()) return listTitle.trim()
  return ''
}

export function parseWhatsAppWebhookPayload(payload: unknown): WhatsAppInboundMessage[] {
  const parsed = payloadSchema.parse(payload)
  const messages: WhatsAppInboundMessage[] = []

  for (const entry of parsed.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value
      const phoneNumberId = value.metadata?.phone_number_id
      if (!phoneNumberId) continue

      for (const message of value.messages ?? []) {
        const text = messageText(message)
        if (!text) continue
        const contact = value.contacts?.find((item) => item.wa_id && item.wa_id === message.from)
        messages.push({
          id: message.id,
          phoneNumberId,
          from: message.from ?? 'unknown',
          senderName: contact?.profile?.name ?? message.from ?? 'WhatsApp user',
          text,
          timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : null,
        })
      }
    }
  }

  return messages
}

export function toSlackMessage(message: WhatsAppInboundMessage): SlackMessage {
  return {
    text: message.text,
    user: message.senderName,
    channel: message.from,
    ts: message.timestamp ? String(message.timestamp.getTime() / 1000) : String(Date.now() / 1000),
    permalink: `https://wa.me/${message.from}`,
  }
}
