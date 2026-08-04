function boundedPositiveInt(name: string, fallback: number, max: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

export const SLACK_USER_SYNC_MAX_CONVERSATIONS = boundedPositiveInt(
  'SLACK_USER_SYNC_MAX_CONVERSATIONS', 50, 200,
)
export const SLACK_USER_SYNC_MAX_MESSAGES_PER_CONVERSATION = boundedPositiveInt(
  'SLACK_USER_SYNC_MAX_MESSAGES_PER_CONVERSATION', 100, 500,
)
export const SLACK_USER_SYNC_LOOKBACK_DAYS = boundedPositiveInt(
  'SLACK_USER_SYNC_LOOKBACK_DAYS', 14, 90,
)
