import { z } from 'zod'

const source = z.enum(['c6', 'c7'])

export const optInBody = z.strictObject({
  channel: z.enum(['whatsapp', 'sms']),
  frequency: z.enum(['every_drop', 'every_second_drop', 'monthly']),
  source
})

export const optOutBody = z.strictObject({
  choice: z.enum(['none', 'stop']),
  source
})
