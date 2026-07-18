/**
 * @jest-environment node
 */
import { isAllowedDatatruckUrl, validateDatatruckEndpointInput } from '../urlSafety'

describe('isAllowedDatatruckUrl', () => {
  it.each([
    'https://acme.datatruck.io/api/v1/openapi/orders/',
    'https://datatruck.io/api/data',
    'https://deep.sub.datatruck.io/list/',
  ])('allows %s', (url) => {
    expect(isAllowedDatatruckUrl(url)).toBe(true)
  })

  it.each([
    'http://acme.datatruck.io/api/', // plain HTTP
    'https://evil.com/api/',
    'https://datatruck.io.evil.com/api/', // suffix spoof
    'https://notdatatruck.io/api/',
    'https://localhost/api/',
    'https://127.0.0.1/api/',
    'https://0.0.0.0/api/',
    'https://10.0.0.5/api/',
    'https://192.168.1.10/api/',
    'https://172.16.0.1/api/',
    'https://169.254.169.254/latest/meta-data/', // metadata service
    'https://[::1]/api/',
    'https://user:pass@acme.datatruck.io/api/', // embedded credentials
    'not a url',
  ])('rejects %s', (url) => {
    expect(isAllowedDatatruckUrl(url)).toBe(false)
  })
})

describe('validateDatatruckEndpointInput', () => {
  it('accepts a relative path and normalizes the leading slash', () => {
    const result = validateDatatruckEndpointInput('invoices/list/')

    expect(result).toEqual({ ok: true, kind: 'relative', value: '/invoices/list/' })
  })

  it('accepts a full Datatruck HTTPS URL', () => {
    const result = validateDatatruckEndpointInput('https://acme.datatruck.io/api/v2/invoices/')

    expect(result).toEqual({ ok: true, kind: 'full_url', value: 'https://acme.datatruck.io/api/v2/invoices/' })
  })

  it('rejects HTTP URLs with a specific message', () => {
    const result = validateDatatruckEndpointInput('http://acme.datatruck.io/api/')

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('HTTPS')
  })

  it('rejects non-Datatruck domains', () => {
    expect(validateDatatruckEndpointInput('https://evil.com/steal').ok).toBe(false)
  })

  it('rejects path traversal in relative paths', () => {
    expect(validateDatatruckEndpointInput('/../secrets').ok).toBe(false)
  })

  it('rejects empty input', () => {
    expect(validateDatatruckEndpointInput('  ').ok).toBe(false)
  })
})
