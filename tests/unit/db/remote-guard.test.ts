import { describe, expect, it } from 'vitest'
import { checkRemoteAllowed } from '../../../server/db/remote-guard'

describe('checkRemoteAllowed', () => {
  it('local databases need nothing', () => {
    expect(checkRemoteAllowed('postgresql://u:p@localhost:5432/db', undefined)).toEqual({ ok: true, host: 'localhost', remote: false })
  })

  it('a remote database is refused without ALLOW_REMOTE_DB=true, and the message shows only the host', () => {
    const result = checkRemoteAllowed('postgresql://user:secret@pooler.example.com:5432/postgres', undefined)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(JSON.stringify(result)).not.toContain('user')
    expect(checkRemoteAllowed('postgresql://u:p@pooler.example.com:5432/postgres', 'yes').ok).toBe(false)
  })

  it('ALLOW_REMOTE_DB=true lets it through', () => {
    expect(checkRemoteAllowed('postgresql://u:p@pooler.example.com:5432/postgres', 'true')).toEqual({
      ok: true,
      host: 'pooler.example.com',
      remote: true
    })
  })
})
