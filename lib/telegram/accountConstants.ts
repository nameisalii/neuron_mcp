function bounded(name: string, fallback: number, max: number) {
  const value = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(value) ? Math.max(1, Math.min(value, max)) : fallback
}

export const telegramAccountLimits = {
  maxDialogs: () => bounded('TELEGRAM_ACCOUNT_SYNC_MAX_DIALOGS', 100, 500),
  maxMessagesPerChat: () => bounded('TELEGRAM_ACCOUNT_SYNC_MAX_MESSAGES_PER_CHAT', 200, 500),
  lookbackDays: () => bounded('TELEGRAM_ACCOUNT_SYNC_LOOKBACK_DAYS', 30, 365),
  maxChatsPerRun: () => bounded('TELEGRAM_ACCOUNT_SYNC_MAX_CHATS_PER_RUN', 5, 50),
  maxMessagesPerRun: () => bounded('TELEGRAM_ACCOUNT_SYNC_MAX_MESSAGES_PER_RUN', 1000, 5000),
}
