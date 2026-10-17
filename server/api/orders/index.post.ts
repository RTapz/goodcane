// POST /api/orders: places a requested order (BR-O9). Validates, calls the service, returns JSON.
// Two bodies: the C3 form, and the C7 reorder (details copied on the server from the session).
// Never logs the body: it can hold a phone number.
import { z } from 'zod'
import { normalisePhone } from '../../domain/identity/phone'
import { createOrderBody, reorderBody, type FieldErrors } from '../../schemas/orders'
import { savedDetails } from '../../services/me'
import { placeOrder, type PlaceOrderInput, type PlaceOrderResult } from '../../services/orders/place-order'

const invalid = (fieldErrors: FieldErrors) =>
  createError({ statusCode: 400, statusMessage: 'invalid_order', data: { reason: 'invalid_order', fieldErrors } })

export default defineEventHandler(async (event) => {
  const raw = await readBody(event).catch(() => null)
  const now = new Date()
  const sessionCustomerId = await getSessionCustomerId(event, now)
  const ctx = { now, sessionCustomerId, demoMode: useRuntimeConfig().public.demoMode }

  let input: PlaceOrderInput
  if (raw && typeof raw === 'object' && 'reorder' in raw) {
    // C7: a returning customer from a valid session only.
    const parsed = reorderBody.safeParse(raw)
    if (!parsed.success) throw invalid(z.flattenError(parsed.error).fieldErrors as FieldErrors)
    if (!sessionCustomerId) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    const saved = await savedDetails(useDb(), sessionCustomerId)
    if (!saved) throw createError({ statusCode: 404, statusMessage: 'Not found' })
    const body = parsed.data
    if (body.fulfilment === 'delivery' && !saved.lastAddress) {
      throw createError({ statusCode: 409, statusMessage: 'details_needed', data: { reason: 'details_needed' } })
    }
    input = {
      dropId: body.dropId,
      lines: body.lines,
      firstName: saved.firstName,
      phone: saved.phone,
      fulfilment:
        body.fulfilment === 'delivery'
          ? { kind: 'delivery', areaId: body.deliveryAreaId, address: saved.lastAddress! }
          : { kind: 'pickup' },
      idempotencyKey: body.idempotencyKey,
      expectedTotalPesewas: body.expectedTotalPesewas
    }
  } else {
    const parsed = createOrderBody.safeParse(raw)
    if (!parsed.success) throw invalid(z.flattenError(parsed.error).fieldErrors as FieldErrors)
    const body = parsed.data
    const phone = normalisePhone(body.phone)
    if (!phone.ok) throw invalid({ phone: [phone.message] })
    input = {
      dropId: body.dropId,
      lines: body.lines,
      firstName: body.firstName,
      phone: phone.phone,
      fulfilment:
        body.fulfilment === 'delivery'
          ? { kind: 'delivery', areaId: body.deliveryAreaId, address: body.deliveryAddress }
          : { kind: 'pickup' },
      idempotencyKey: body.idempotencyKey
    }
  }

  const result: PlaceOrderResult = await placeOrder(useDb(), input, ctx)
  switch (result.kind) {
    case 'created':
      if (result.newSessionToken) setSessionCookie(event, result.newSessionToken)
      setResponseStatus(event, 201)
      return { orderId: result.orderId }
    case 'existing':
      return { orderId: result.orderId }
    case 'rejected':
      throw createError({ statusCode: 409, statusMessage: result.reason, data: result })
    case 'invalid':
      throw createError({ statusCode: 400, statusMessage: result.reason, data: { reason: result.reason } })
  }
})
