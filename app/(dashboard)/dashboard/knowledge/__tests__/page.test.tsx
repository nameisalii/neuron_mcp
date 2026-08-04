import KnowledgePage from '../page'
import { prisma } from '@/lib/db'

jest.mock('@clerk/nextjs/server', () => ({ auth: jest.fn().mockResolvedValue({ userId: 'user-1' }) }))
jest.mock('next/navigation', () => ({ redirect: jest.fn() }))
jest.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: jest.fn().mockResolvedValue({ workspace: { id: 'workspace-1' } }) },
    knowledgeItem: { count: jest.fn(), findMany: jest.fn() },
  },
}))

const mockCount = prisma.knowledgeItem.count as jest.Mock
const mockFindMany = prisma.knowledgeItem.findMany as jest.Mock

beforeEach(() => {
  mockCount
    .mockReset()
    .mockResolvedValueOnce(10)
    .mockResolvedValueOnce(2)
    .mockResolvedValueOnce(3)
    .mockResolvedValueOnce(2)
  mockFindMany.mockReset().mockResolvedValue([{
    id: 'knowledge-1',
    content: 'Drivers must check in before departure.',
    summary: 'Driver check-in rule.',
    reason: null,
    label: 'Check-in',
    category: 'rule',
    source: 'telegram',
    sourceUrl: null,
    sourceMetadata: null,
    notionPageTitle: null,
    verified: true,
    createdAt: new Date('2026-07-20T10:00:00.000Z'),
    updatedAt: new Date('2026-07-21T10:00:00.000Z'),
  }])
})

it('loads workspace-visible knowledge with only existing schema fields', async () => {
  const result = await KnowledgePage({ searchParams: Promise.resolve({}) })

  expect(result.props.counts).toEqual({ total: 8, rules: 3, decisions: 2, integrations: 1 })
  expect(result.props.initialType).toBe('all')
  expect(result.props.items[0]).toEqual(expect.objectContaining({
    title: 'Check-in',
    summary: 'Driver check-in rule.',
    category: 'rules',
    source: 'telegram',
    verified: true,
  }))
  expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({
    where: {
      workspaceId: 'workspace-1',
      OR: [
        { visibility: 'team' },
        { visibility: 'personal', visibilitySetBy: 'user-1' },
      ],
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    take: 100,
    select: expect.not.objectContaining({ title: expect.anything(), status: expect.anything(), tags: expect.anything(), sourcer: expect.anything() }),
  }))
})

it('preselects Rules for the rules query parameter', async () => {
  const result = await KnowledgePage({ searchParams: Promise.resolve({ type: 'rules' }) })
  expect(result.props.initialType).toBe('rules')
})
