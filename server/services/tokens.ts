// Random tokens (BR-L2): 32 random bytes, base64url. Only the SHA-256 hash is ever stored.
import { createHash, randomBytes } from 'node:crypto'

export const SESSION_DAYS = 90

export function generateToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}
