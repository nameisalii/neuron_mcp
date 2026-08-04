# Telegram Account Sync — Advanced

Telegram Account Sync is a private integration mode and is disabled by default with
`TELEGRAM_ACCOUNT_SYNC_ENABLED=false`.

It is separate from Telegram Bot Mode and Public Channel Import. Bot Mode can only receive updates
from chats where the bot was added. Public import can only read public `t.me` channel pages.

## Implemented safety boundaries

- Uses the maintained `teleproto` Telegram client/MTProto library with `TELEGRAM_API_ID` and `TELEGRAM_API_HASH`.
- Ask for a phone number, send a Telegram login code, and accept that one-time code.
- Ask for a 2FA password only when Telegram requires it; never store or log the password.
- Encrypt the resulting Telegram session with `ENCRYPTION_KEY`.
- Never return session data, login codes, API hash values, or credentials to the browser.
- List at most `TELEGRAM_ACCOUNT_SYNC_MAX_DIALOGS` accessible dialogs.
- Sync only explicitly selected chats.
- Limit each chat to `TELEGRAM_ACCOUNT_SYNC_MAX_MESSAGES_PER_CHAT` and the configured lookback.
- Default private chats to personal visibility.
- Provide disconnect and encrypted-session deletion.

The session and pending authorization state are AES-256-GCM encrypted using the dedicated
`TELEGRAM_SESSION_ENCRYPTION_KEY`. Account sync remains unavailable unless the feature flag,
Telegram API credentials, and session encryption key are explicitly configured.
