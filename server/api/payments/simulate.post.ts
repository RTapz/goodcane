// POST /api/payments/simulate: the simulated provider callback (BR-P2). No real payment code.
import { simulatePaymentBody, type SimulatePaymentResponse } from '../../schemas/payments'
import { simulatePayment } from '../../services/payments/simulate'

const notFound = () => createError({ statusCode: 404, statusMessage: 'Order not found' })

export default defineEventHandler(async (event): Promise<SimulatePaymentResponse> => {
  const body = simulatePaymentBody.safeParse(await readBody(event).catch(() => null))
  if (!body.success) throw createError({ statusCode: 400, statusMessage: 'invalid_payment' })

  const now = new Date()
  const customerId = await getSessionCustomerId(event, now)
  if (!customerId) throw notFound()

  const outcome = await simulatePayment(useDb(), body.data, {
    now,
    customerId,
    demoMode: useRuntimeConfig().public.demoMode
  })
  if (outcome.kind === 'not_found') throw notFound()
  if (outcome.kind === 'reference_conflict') {
    throw createError({ statusCode: 409, statusMessage: 'reference_conflict', data: { reason: 'reference_conflict' } })
  }

  const links = outcome.privateLinkToken ? shareLinksFor(outcome.privateLinkToken) : null
  return {
    result: outcome.result,
    reason: outcome.reason,
    refundDue: outcome.refundDue,
    replayed: outcome.kind === 'replayed',
    privateLink: links?.privateLink ?? null,
    whatsappUrl: links?.whatsappUrl ?? null
  }
})
