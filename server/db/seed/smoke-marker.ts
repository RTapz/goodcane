// The customer `pnpm smoke` creates (spec section 9). The seed deletes any customer with this
// name and phone, whatever its is_sample flag, so smoke runs never outlive a reseed.
export const SMOKE_FIRST_NAME = 'Smoke test'
/** As the smoke test types it. */
export const SMOKE_PHONE_INPUT = '0200000099'
/** As it is stored (BR-L9). */
export const SMOKE_PHONE = '+233200000099'
