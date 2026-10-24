// POST /api/owner/reminders/:id/send: Send (BR-R3, BR-L5). Returns the message with a fresh
// reminder link once, and a prefilled chat to the demo number only (constraint 3). The app sends nothing.
import { z } from 'zod'
import { reminderLinkUrl, whatsappShareUrl } from '../../../../domain/identity/share'
import { sendReminder } from '../../../../services/reminders-queue'

export default defineEventHandler(async (event) => {
  const id = z.uuid().safeParse(getRouterParam(event, 'id'))
  if (!id.success) throw createError({ statusCode: 404, statusMessage: 'Reminder not found' })
  const config = useRuntimeConfig()
  const result = await sendReminder(useDb(), id.data, new Date(), { demoMode: config.public.demoMode })
  if (result.kind === 'not_found') throw createError({ statusCode: 404, statusMessage: 'Reminder not found' })
  if (result.kind === 'refused') throw createError({ statusCode: 409, statusMessage: result.reason, data: { reason: result.reason } })

  setHeader(event, 'Cache-Control', 'no-store')
  const link = reminderLinkUrl(config.public.appUrl, result.token)
  const text = reminderText(result.firstName, result.drop.dropAt, result.drop.cutOffAt, link)
  return {
    link,
    text,
    whatsappUrl: whatsappShareUrl(config.demoWhatsappNumber, text)
  }
})

function reminderText(firstName: string, dropAt: Date, cutOffAt: Date, link: string) {
  const day = (d: Date) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Accra' })
  const time = cutOffAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' })
  return `Hi ${firstName}, the next GoodCane drop is ${day(dropAt)}. Orders close ${day(cutOffAt)} at ${time}. Same again? ${link}`
}
