// Some forecast numbers cannot always be worked out (no history yet, nothing to divide by).
// Instead of returning NaN or a made-up number, those functions return one of these:
// either { ok: true, value } or { ok: false, reason } with a reason the screen can explain.

export type Available<T> = { ok: true; value: T }
export type Unavailable<R extends string> = { ok: false; reason: R }
export type Maybe<T, R extends string> = Available<T> | Unavailable<R>

export function available<T>(value: T): Available<T> {
  return { ok: true, value }
}

export function unavailable<R extends string>(reason: R): Unavailable<R> {
  return { ok: false, reason }
}
