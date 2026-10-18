// Which address the owner login throttle counts attempts against (spec 8, TRUST_PROXY).
//
// Any client can send X-Forwarded-For with whatever it likes, so trusting it would let one
// person make unlimited guesses by changing it each time. Vercel overwrites its own
// x-vercel-forwarded-for header with the real client address, so that one header can be
// trusted when (and only when) the app is known to run behind Vercel: TRUST_PROXY=true.
// Every other forwarded header is ignored in both modes.

export const VERCEL_CLIENT_IP_HEADER = 'x-vercel-forwarded-for'

export function clientIp(args: {
  trustProxy: boolean
  /** The x-vercel-forwarded-for header, if present. */
  vercelHeader: string | undefined
  /** The address of the connection itself. */
  connectionAddress: string | undefined
}): string {
  if (args.trustProxy && args.vercelHeader) {
    // The client is the first address in the list.
    const first = args.vercelHeader.split(',')[0]?.trim()
    if (first) return first
  }
  return args.connectionAddress ?? 'unknown'
}
