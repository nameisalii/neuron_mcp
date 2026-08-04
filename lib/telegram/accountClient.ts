import 'server-only'

export type TelegramAccountUser = {
  id: string
  username: string | null
  displayName: string
}

export type TelegramAccountDialog = {
  chatId: string
  accessHash: string | null
  title: string
  username: string | null
  chatType: 'channel' | 'group' | 'supergroup' | 'private'
  lastMessageAt: Date | null
}

export type TelegramAccountMessage = {
  messageId: string
  text: string
  date: Date
  externalAuthorId: string | null
  authorName: string | null
}

type PendingSession = { session: string; phoneNumber: string; phoneCodeHash: string }
type ConnectedSession = { session: string }

function credentials() {
  const apiId = Number.parseInt(process.env.TELEGRAM_API_ID ?? '', 10)
  const apiHash = process.env.TELEGRAM_API_HASH?.trim()
  if (!Number.isInteger(apiId) || !apiHash) throw new Error('Telegram Account Sync is not configured.')
  return { apiId, apiHash }
}

async function clientFor(session = '') {
  const [{ TelegramClient, Api }, { StringSession }] = await Promise.all([
    import('teleproto'),
    import('teleproto/sessions'),
  ])
  const auth = credentials()
  const stringSession = new StringSession(session)
  const client = new TelegramClient(stringSession, auth.apiId, auth.apiHash, {
    connectionRetries: 3,
    autoReconnect: false,
  })
  await client.connect()
  return { client, stringSession, Api, auth }
}

function userResult(user: Record<string, unknown>): TelegramAccountUser {
  const first = typeof user.firstName === 'string' ? user.firstName : ''
  const last = typeof user.lastName === 'string' ? user.lastName : ''
  return {
    id: String(user.id ?? ''),
    username: typeof user.username === 'string' ? user.username : null,
    displayName: `${first} ${last}`.trim() || (typeof user.username === 'string' ? user.username : 'Telegram user'),
  }
}

export async function sendLoginCode(phoneNumber: string): Promise<PendingSession> {
  const { client, stringSession, auth } = await clientFor()
  try {
    const sent = await client.sendCode(auth, phoneNumber)
    return { session: stringSession.save(), phoneNumber, phoneCodeHash: sent.phoneCodeHash }
  } finally {
    await client.disconnect()
  }
}

export async function signInWithCode(pending: PendingSession, code: string): Promise<
  | { status: 'connected'; session: string; user: TelegramAccountUser }
  | { status: 'pending_password'; session: string }
> {
  const { client, stringSession, Api } = await clientFor(pending.session)
  try {
    try {
      const authorization = await client.invoke(new Api.auth.SignIn({
        phoneNumber: pending.phoneNumber,
        phoneCodeHash: pending.phoneCodeHash,
        phoneCode: code,
      })) as unknown as { user?: Record<string, unknown> }
      if (!authorization.user) throw new Error('Telegram authorization did not return a user.')
      return { status: 'connected', session: stringSession.save(), user: userResult(authorization.user) }
    } catch (error) {
      const codeName = String((error as { errorMessage?: string }).errorMessage ?? (error as Error).message)
      if (/SESSION_PASSWORD_NEEDED/i.test(codeName)) {
        return { status: 'pending_password', session: stringSession.save() }
      }
      throw error
    }
  } finally {
    await client.disconnect()
  }
}

export async function signInWithPassword(session: string, password: string): Promise<{ session: string; user: TelegramAccountUser }> {
  const { client, stringSession, auth } = await clientFor(session)
  try {
    const user = await client.signInWithPassword(auth, {
      password: async () => password,
      onError: async () => true,
    }) as unknown as Record<string, unknown>
    return { session: stringSession.save(), user: userResult(user) }
  } finally {
    await client.disconnect()
  }
}

async function connectedClient(input: ConnectedSession) {
  const result = await clientFor(input.session)
  if (!await result.client.checkAuthorization()) {
    await result.client.disconnect()
    throw new Error('TELEGRAM_SESSION_EXPIRED')
  }
  return result
}

function idString(value: unknown) {
  return value && typeof (value as { toString?: () => string }).toString === 'function'
    ? (value as { toString: () => string }).toString()
    : String(value ?? '')
}

export async function getDialogs(session: string, limit: number): Promise<TelegramAccountDialog[]> {
  const { client } = await connectedClient({ session })
  try {
    const dialogs = await client.getDialogs({ limit })
    return dialogs.flatMap((dialog) => {
      const entity = dialog.entity as unknown as Record<string, unknown> | undefined
      const chatId = idString(dialog.id)
      if (!entity || !chatId) return []
      const isBroadcast = entity.broadcast === true
      const isMegagroup = entity.megagroup === true
      const chatType: TelegramAccountDialog['chatType'] = dialog.isUser
        ? 'private'
        : isBroadcast
          ? 'channel'
          : isMegagroup
            ? 'supergroup'
            : 'group'
      return [{
        chatId,
        accessHash: entity.accessHash ? idString(entity.accessHash) : null,
        title: dialog.name || dialog.title || (typeof entity.username === 'string' ? entity.username : 'Telegram chat'),
        username: typeof entity.username === 'string' ? entity.username : null,
        chatType,
        lastMessageAt: dialog.date ? new Date(dialog.date * 1000) : null,
      }]
    })
  } finally {
    await client.disconnect()
  }
}

export async function getMessages(session: string, chatId: string, options: {
  limit: number
  offsetDate?: Date
}): Promise<TelegramAccountMessage[]> {
  const { client } = await connectedClient({ session })
  try {
    const dialogs = await client.getDialogs({ limit: 500 })
    const dialog = dialogs.find((item) => idString(item.id) === chatId)
    if (!dialog) throw new Error('TELEGRAM_CHAT_UNAVAILABLE')
    const messages = await client.getMessages(dialog.inputEntity, {
      limit: options.limit,
      offsetDate: options.offsetDate ? Math.floor(options.offsetDate.getTime() / 1000) : undefined,
    })
    return messages.flatMap((message) => {
      const value = message as unknown as Record<string, unknown>
      const text = typeof value.message === 'string' ? value.message.trim() : ''
      if (!text || value.action) return []
      const timestamp = typeof value.date === 'number' ? value.date : 0
      return [{
        messageId: idString(value.id),
        text,
        date: new Date(timestamp * 1000),
        externalAuthorId: value.senderId ? idString(value.senderId) : null,
        authorName: null,
      }]
    })
  } finally {
    await client.disconnect()
  }
}

export async function disconnectSession(session: string) {
  const { client } = await clientFor(session)
  try {
    if (await client.checkAuthorization()) await client.invoke(new (await import('teleproto')).Api.auth.LogOut())
  } finally {
    await client.disconnect()
  }
}
