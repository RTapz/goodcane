import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const envExample = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8')

describe('.env.example', () => {
  it.each(['DATABASE_URL', 'DEMO_MODE', 'DEMO_WHATSAPP_NUMBER', 'OWNER_PASSCODE', 'APP_URL', 'TRUST_PROXY'])(
    'lists %s',
    (key) => {
      expect(envExample).toMatch(new RegExp(`^${key}=`, 'm'))
    }
  )

  it('defaults to demo mode', () => {
    expect(envExample).toMatch(/^DEMO_MODE=true$/m)
  })
})
