// POST /api/orders: places a requested order (BR-O9). Validates, calls the service, returns JSON.
// Never logs the body: it holds a phone number.
import { z } from 'zod'
import { normalisePhone } from '../../domain/identity/phone'
import { createOrderBody, type FieldErrors } from '../../schemas/orders'
import { placeOrder } from '../../services/orders/place-order'

export default defineEventHandler(async (event) => {
  const parsed = createOrderBody.safeParse(await readBody(event).catch(() => null))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'invalid_order',
      data: { reason: 'invalid_order', fieldErrors: z.flattenError(parsed.error).fieldErrors as FieldErrors }
    })
  }
  const body = parsed.data

  const phone = normalisePhone(body.phone)
  if (!phone.ok) {
    throw createError({
      statusCode: 400,
      statusMessage: 'invalid_order',
      data: { reason: 'invalid_order', fieldErrors: { phone: [phone.message] } satisfies FieldErrors }
    })
  }

  const result = await placeOrder(
    useDb(),
    {
      dropId: body.dropId,
      lines: body.lines,
      firstName: body.firstName,
      phone: phone.phone,
      fulfilment:
        body.fulfilment === 'delivery'
          ? { kind: 'delivery', areaId: body.deliveryAreaId, address: body.deliveryAddress }
          : { kind: 'pickup' },
      idempotencyKey: body.idempotencyKey
    },
    {
      now: new Date(),
      sessionCustomerId: await getSessionCustomerId(event),
      demoMode: useRuntimeConfig().public.demoMode
    }
  )

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
