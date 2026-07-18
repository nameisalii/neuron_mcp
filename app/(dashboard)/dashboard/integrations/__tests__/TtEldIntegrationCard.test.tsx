import { render, screen } from '@testing-library/react'
import TtEldIntegrationCard from '../TtEldIntegrationCard'
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
it('renders the disconnected Five ELD state', () => { render(<TtEldIntegrationCard status="not_connected" usdot={null} lastSyncAt={null} counts={{}} />); expect(screen.getByText('Five ELD')).toBeInTheDocument(); expect(screen.getByRole('link', { name: 'Connect' })).toHaveAttribute('href', '/dashboard/integrations/five-eld') })
it('renders live fleet management without credentials', () => { render(<TtEldIntegrationCard status="connected" usdot="123456" lastSyncAt={null} counts={{ realtimeUnits: 5 }} />); expect(screen.getByRole('link', { name: /View live fleet/ })).toHaveAttribute('href', '/dashboard/integrations/five-eld'); expect(document.body.textContent).not.toMatch(/x-api-key|provider-token/) })
