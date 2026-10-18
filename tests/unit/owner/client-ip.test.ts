import { describe, expect, it } from 'vitest'
import { clientIp } from '../../../server/domain/owner/client-ip'

describe('clientIp (TRUST_PROXY)', () => {
  it('false: always the connection address, whatever headers say', () => {
    expect(clientIp({ trustProxy: false, vercelHeader: '198.51.100.9', connectionAddress: '10.0.0.1' })).toBe('10.0.0.1')
  })

  it('true: the first address in x-vercel-forwarded-for', () => {
    expect(clientIp({ trustProxy: true, vercelHeader: '198.51.100.9, 10.1.1.1', connectionAddress: '10.0.0.1' })).toBe('198.51.100.9')
  })

  it('true but the header is missing or empty: falls back to the connection address', () => {
    expect(clientIp({ trustProxy: true, vercelHeader: undefined, connectionAddress: '10.0.0.1' })).toBe('10.0.0.1')
    expect(clientIp({ trustProxy: true, vercelHeader: ' ', connectionAddress: '10.0.0.1' })).toBe('10.0.0.1')
  })

  it('no address at all: one shared "unknown" bucket, so the limit still applies', () => {
    expect(clientIp({ trustProxy: false, vercelHeader: undefined, connectionAddress: undefined })).toBe('unknown')
  })
})
