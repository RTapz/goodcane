// Ghana phone numbers (BR-L9). Pure: shared by the C3 form and the server.

export type PhoneResult = { ok: true; phone: string } | { ok: false; message: string }

export const PHONE_HINT = 'Use 024 123 4567 or +233 24 123 4567'

/**
 * Accepts 0XXXXXXXXX or +233XXXXXXXXX (spaces and hyphens ignored) and returns +233XXXXXXXXX.
 * Anything else is rejected with a message the customer can act on.
 */
export function normalisePhone(input: string): PhoneResult {
  const compact = input.replace(/[\s-]/g, '')
  if (/^0\d{9}$/.test(compact)) {
    return { ok: true, phone: `+233${compact.slice(1)}` }
  }
  if (/^\+233\d{9}$/.test(compact)) {
    return { ok: true, phone: compact }
  }
  return { ok: false, message: `Enter a Ghana mobile number. ${PHONE_HINT}.` }
}

/** Shows only the last 3 digits (BR-L8). */
export function maskPhone(phone: string): string {
  return `${'•'.repeat(Math.max(0, phone.length - 3))}${phone.slice(-3)}`
}
