// "Demo Customer A" (spec section 9, BR-L4 exception): a sample customer the seed creates in
// DEMO_MODE only, with a fixed, published private link so the demo video and reviewers reach C7
// "Same again?" in one tap. Never created outside demo mode; rebuilt on every reseed. Only the
// hash of this token is stored, like every other token.
export const DEMO_CUSTOMER_NAME = 'Demo Customer A'
export const DEMO_CUSTOMER_PHONE = '0000000099'
/** 43 characters of base64url, like a real token, but readable and published on purpose. */
export const DEMO_CUSTOMER_TOKEN = 'DemoCustomerA-GoodCaneDrops-sampleLink-0001'

export function demoCustomerLink(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/c/${DEMO_CUSTOMER_TOKEN}`
}
