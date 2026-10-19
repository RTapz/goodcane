// GET /api/lost-link: C8 "Lost your link? Message GoodCane". Same answer for everyone: no
// session, phone or token is read, so it can never reveal anyone's orders (BR-L7).
import { lostLinkHelp } from '../domain/identity/share'

export default defineEventHandler(() => lostLinkHelp(useRuntimeConfig().demoWhatsappNumber))
