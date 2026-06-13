import DashboardPage from '../page'
import BrainPage from '../brain/page'
import DecisionsPage from '../decisions/page'
import IdeasPage from '../ideas/page'
import { redirect } from 'next/navigation'

jest.mock('next/navigation', () => ({ redirect: jest.fn() }))

it('redirects legacy knowledge routes to Overview filters', () => {
  DashboardPage()
  BrainPage()
  DecisionsPage()
  IdeasPage()
  expect(redirect).toHaveBeenCalledWith('/dashboard/overview')
  expect(redirect).toHaveBeenCalledWith('/dashboard/overview?filter=decisions')
  expect(redirect).toHaveBeenCalledWith('/dashboard/overview?filter=ideas')
})
