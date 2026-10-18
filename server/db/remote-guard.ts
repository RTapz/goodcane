// Seeding and migrating change a whole database, so a remote one (Supabase) needs a deliberate
// ALLOW_REMOTE_DB=true on that one command. A connection string left in .env can then never be
// changed by accident. Only the host is ever shown, never the full string.

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

export type RemoteCheck = { ok: true; host: string; remote: boolean } | { ok: false; host: string; message: string }

export function checkRemoteAllowed(databaseUrl: string, allowRemote: string | undefined): RemoteCheck {
  const host = new URL(databaseUrl).hostname
  const remote = !LOCAL_HOSTS.has(host)
  if (remote && allowRemote !== 'true') {
    return {
      ok: false,
      host,
      message: `Refusing to change the remote database at ${host}. Set ALLOW_REMOTE_DB=true for this one command if that is intended.`
    }
  }
  return { ok: true, host, remote }
}
