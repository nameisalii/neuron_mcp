import { parseWhatsAppWebhookPayload, toSlackMessage } from '../webhook'

describe('WhatsApp webhook parsing', () => {
  it('extracts inbound text messages with phone number attribution', () => {
    const messages = parseWhatsAppWebhookPayload({
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: 'phone-1', display_phone_number: '+15551234567' },
                contacts: [{ wa_id: '15550001111', profile: { name: 'Ada Lovelace' } }],
                messages: [
                  {
                    id: 'wamid.1',
                    from: '15550001111',
                    timestamp: '1800000000',
                    type: 'text',
                    text: { body: 'Please pause the launch until legal approves it.' },
                  },
                ],
              },
            },
          ],
        },
      ],
    })

    expect(messages).toEqual([
      {
        id: 'wamid.1',
        phoneNumberId: 'phone-1',
        from: '15550001111',
        senderName: 'Ada Lovelace',
        text: 'Please pause the launch until legal approves it.',
        timestamp: new Date(1800000000 * 1000),
      },
    ])
    expect(toSlackMessage(messages[0])).toMatchObject({
      text: 'Please pause the launch until legal approves it.',
      user: 'Ada Lovelace',
      channel: '15550001111',
      permalink: 'https://wa.me/15550001111',
    })
  })
})
