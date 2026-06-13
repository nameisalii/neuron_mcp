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
})
