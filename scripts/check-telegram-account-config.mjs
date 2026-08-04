const enabled = process.env.TELEGRAM_ACCOUNT_SYNC_ENABLED === 'true'
const apiIdPresent = Boolean(process.env.TELEGRAM_API_ID)
const apiHashPresent = Boolean(process.env.TELEGRAM_API_HASH)
const encryptionKey = process.env.TELEGRAM_SESSION_ENCRYPTION_KEY ?? ''

console.log('TELEGRAM_ACCOUNT_SYNC_ENABLED', enabled)
console.log('TELEGRAM_API_ID present', apiIdPresent)
console.log('TELEGRAM_API_HASH present', apiHashPresent)
console.log('TELEGRAM_SESSION_ENCRYPTION_KEY present', Boolean(encryptionKey))
console.log('TELEGRAM_SESSION_ENCRYPTION_KEY valid', /^[0-9a-fA-F]{64}$/.test(encryptionKey))
