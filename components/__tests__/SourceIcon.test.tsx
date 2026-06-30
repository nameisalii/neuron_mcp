import { render, screen } from '@testing-library/react'
import SourceIcon from '../SourceIcon'

describe('SourceIcon', () => {
  it('renders Gmail and Notion from local assets', () => {
    render(
      <div>
        <SourceIcon source="gmail" />
        <SourceIcon source="notion" />
      </div>,
    )

    expect(screen.getByAltText('Gmail')).toHaveAttribute('src', expect.stringContaining('gmail.png'))
    expect(screen.getByAltText('Notion')).toHaveAttribute('src', expect.stringContaining('/icons/notion.svg'))
  })

  it('renders Slack from a local logo asset', () => {
    render(<SourceIcon source="slack" />)
    expect(screen.getByAltText('Slack')).toHaveAttribute('src', expect.stringContaining('slack.png'))
  })

  it('renders Discord, Granola, and WhatsApp from local logo assets', () => {
    render(
      <div>
        <SourceIcon source="discord" />
        <SourceIcon source="granola" />
        <SourceIcon source="telegram" />
        <SourceIcon source="teams" />
        <SourceIcon source="jira" />
        <SourceIcon source="whatsapp" />
      </div>,
    )

    expect(screen.getByAltText('Discord')).toHaveAttribute('src', expect.stringContaining('discord.png'))
    expect(screen.getByAltText('Granola')).toHaveAttribute('src', expect.stringContaining('granola.png'))
    expect(screen.getByAltText('Telegram')).toHaveAttribute('src', expect.stringContaining('telegram.png'))
    expect(screen.getByAltText('Microsoft Teams')).toHaveAttribute('src', expect.stringContaining('teams.png'))
    expect(screen.getByAltText('Jira')).toHaveAttribute('src', expect.stringContaining('jira.png'))
    expect(screen.getByAltText('WhatsApp Business')).toHaveAttribute('src', expect.stringContaining('/icons/whatsapp.svg'))
  })
})
