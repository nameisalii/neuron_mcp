import { render, screen } from '@testing-library/react'
import MicrosoftAdminRequiredPage from '../page'

describe('MicrosoftAdminRequiredPage', () => {
  it('shows a safe, friendly admin approval experience', () => {
    render(<MicrosoftAdminRequiredPage />)

    expect(screen.getByRole('heading', { name: 'Administrator approval required' })).toBeInTheDocument()
    expect(screen.getByText('Microsoft account connected.')).toBeInTheDocument()
    expect(screen.getByText('Teams message sync requires administrator approval from your Microsoft 365 organization.')).toBeInTheDocument()
    expect(screen.getByText(/ChannelMessage.Read.All, Team.ReadBasic.All, and Channel.ReadBasic.All/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Try another Microsoft account' })).toHaveAttribute('href', '/api/integrations/teams/connect?level=teams')
    expect(screen.getByRole('button', { name: 'Copy admin approval instructions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Integrations' })).toHaveAttribute('href', '/dashboard/integrations')
    expect(document.body.textContent).not.toMatch(/AADSTS\d+|client_secret|access_token/i)
  })
})
