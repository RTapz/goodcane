// GET /api/owner/metrics: the four required pilot metrics (spec section 10).
import { pilotMetrics } from '../../services/owner/metrics'

export default defineEventHandler(async () => {
  return { metrics: await pilotMetrics(useDb(), { now: new Date(), demoMode: useRuntimeConfig().public.demoMode }) }
})
