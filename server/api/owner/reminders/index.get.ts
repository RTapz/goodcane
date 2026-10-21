// GET /api/owner/reminders: O5. Builds the queue for the next drop (BR-R3) and lists Due now and
// Coming up (BR-R4). Masked phones only (BR-L8).
import { buildQueue } from '../../../services/reminders-queue'

export default defineEventHandler(async () => {
  const queue = await buildQueue(useDb(), new Date())
  return { ...queue, demoMode: useRuntimeConfig().public.demoMode }
})
