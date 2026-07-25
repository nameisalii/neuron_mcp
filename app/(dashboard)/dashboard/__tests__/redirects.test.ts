import BrainPage from '../brain/page'
import IdeasPage from '../ideas/page'
import { redirect } from 'next/navigation'

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))

it('redirects legacy internal-memory routes to Overview filters', () => {
  BrainPage()
  IdeasPage()
  expect(redirect).toHaveBeenCalledWith('/dashboard/overview')
  expect(redirect).toHaveBeenCalledWith('/dashboard/overview?filter=ideas')
})
