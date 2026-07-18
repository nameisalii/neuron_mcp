import { fireEvent, render, screen } from '@testing-library/react'
import UpcomingIntegrationCard from '../UpcomingIntegrationCard'

describe('UpcomingIntegrationCard', () => {
  afterEach(() => { delete (global as { fetch?: typeof fetch }).fetch })

  it('shows Gmail verification status without starting OAuth', () => {
    const fetchSpy = jest.fn()
    global.fetch = fetchSpy
    render(
      <UpcomingIntegrationCard
        brand="gmail"
        name="Gmail"
        status="Verification pending"
        description="Gmail integration is waiting for Google restricted-scope verification."
        buttonLabel="View status"
        modalTitle="Gmail is coming soon"
        modalCopy="Gmail requires Google restricted-scope verification before users can connect smoothly."
        requirements={[
          { label: 'Required scope', value: 'gmail.readonly' },
          { label: 'Access', value: 'Approved test users only' },
        ]}
      />,
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View status' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Gmail is coming soon')
    expect(screen.getByText('gmail.readonly')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('shows Teams admin requirements without starting OAuth', () => {
    const fetchSpy = jest.fn()
    global.fetch = fetchSpy
    render(
      <UpcomingIntegrationCard
        brand="teams"
        name="Microsoft Teams"
        status="Admin approval required"
        description="Microsoft Teams requires organization admin approval."
        buttonLabel="View requirements"
        modalTitle="Microsoft Teams is coming soon"
        modalCopy="Microsoft organizations often require administrator approval."
        requirements={[{ label: 'Microsoft Graph permissions', value: 'User.Read, Team.ReadBasic.All, Channel.ReadBasic.All, ChannelMessage.Read.All' }]}
        footer="Your Microsoft 365 admin may need to approve Neuron before Teams can connect."
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'View requirements' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Microsoft Teams is coming soon')
    expect(screen.getByText(/ChannelMessage.Read.All/)).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
