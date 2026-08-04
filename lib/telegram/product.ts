export function telegramModeCapabilityAnswer(question: string): string | null {
  const asksAboutTelegram = /\btelegram\b/i.test(question)
  const asksWithoutBot = /(without (?:adding )?(?:the )?bot|not add(?:ing)? (?:the )?bot|channels? without|does (?:the )?bot need)/i.test(question)
  if (!asksAboutTelegram || !asksWithoutBot) return null

  return [
    'Yes for public channels: use Public Channel Import with a public t.me channel link; no bot is required.',
    'For private channels or chats your user account can access, Telegram Account Sync is the advanced option and is disabled by default.',
    'Telegram Bot Mode cannot read a chat unless @neuron_mcp_bot has been added to that chat.',
  ].join(' ')
}
