import { withPrismaRetry } from '../retry'

describe('withPrismaRetry', () => {
  it('retries a closed connection and returns the successful result', async () => {
    const operation = jest.fn()
      .mockRejectedValueOnce(new Error('Error in PostgreSQL connection: Error { kind: Closed, cause: None }'))
      .mockResolvedValueOnce('ok')

    await expect(withPrismaRetry(operation, { delaysMs: [0] })).resolves.toBe('ok')
    expect(operation).toHaveBeenCalledTimes(2)
  })

  it('does not retry Prisma validation errors', async () => {
    const error = Object.assign(new Error('Invalid query'), { name: 'PrismaClientValidationError' })
    const operation = jest.fn().mockRejectedValue(error)

    await expect(withPrismaRetry(operation, { delaysMs: [0] })).rejects.toBe(error)
    expect(operation).toHaveBeenCalledTimes(1)
  })
})
