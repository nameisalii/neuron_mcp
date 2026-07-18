import { render, screen } from '@testing-library/react'
import TtEldSetupModal from '../TtEldSetupModal'
it('renders the setup guide and masks credential fields', () => {
  render(<TtEldSetupModal open onClose={jest.fn()} onConnected={jest.fn()} />)
  expect(screen.getByText('How to connect TT ELD')).toBeInTheDocument(); expect(screen.getByLabelText('x-api-key')).toHaveAttribute('type', 'password'); expect(screen.getByLabelText('provider-token')).toHaveAttribute('type', 'password'); expect(screen.getByText(/stores credentials encrypted/)).toBeInTheDocument()
})
