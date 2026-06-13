import { render, screen } from '@testing-library/react'
import EmailDigestPreview from '../EmailDigestPreview'

const data = {
  knowledgeCount: 12,
  decisionsCount: 3,
  ideasCount: 2,
  undocumentedDecisions: 1,
  conflicts: 0,
  tokensSaved: 1800,
  topItems: [
    { id: 'decision-1', category: 'decision', content: 'Use the shared launch checklist.' },
    { id: 'idea-1', category: 'idea', content: 'Add a weekly customer feedback review.' },
    { id: 'update-1', category: 'status_update', content: 'The onboarding refresh is in progress.' },
    { id: 'knowledge-1', category: 'fact', content: 'Enterprise trials run for 30 days.' },
  ],
}

describe('EmailDigestPreview', () => {
  it('renders a focused digest without nested dashboard controls', () => {
    render(<EmailDigestPreview data={data} />)

    expect(screen.getByRole('heading', { name: 'What is going on' })).toBeInTheDocument()
    expect(screen.getByText('Use the shared launch checklist.')).toBeInTheDocument()
    expect(screen.getByText('Enterprise trials run for 30 days.')).toBeInTheDocument()
    expect(screen.queryByText('Your company’s collective intelligence.')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send test email to my address' })).not.toBeInTheDocument()
  })
})
