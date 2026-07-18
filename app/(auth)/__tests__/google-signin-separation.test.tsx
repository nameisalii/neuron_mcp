import { render, screen } from '@testing-library/react'
import SignInPage from '../sign-in/[[...sign-in]]/page'
import SignUpPage from '../sign-up/[[...sign-up]]/page'

jest.mock('@clerk/nextjs', () => ({ SignIn: () => <div>Clerk Sign In</div>, SignUp: () => <div>Clerk Sign Up</div> }))

it('keeps Gmail verification messaging off basic Google sign-in and sign-up pages', () => {
  const { rerender } = render(<SignInPage />)
  expect(screen.getByText('Clerk Sign In')).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/Gmail connection requires Google verification|restricted.scope/i)
  rerender(<SignUpPage />)
  expect(screen.getByText('Clerk Sign Up')).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/Gmail connection requires Google verification|restricted.scope/i)
})
