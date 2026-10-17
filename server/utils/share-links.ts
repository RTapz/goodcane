// Builds the private link and its WhatsApp share link from runtime config.
// DEMO_WHATSAPP_NUMBER stays on the server: only the finished wa.me URL is sent to the browser.
import { privateLinkUrl, whatsappShareUrl } from '../domain/identity/share'

export function shareLinksFor(rawToken: string) {
  const config = useRuntimeConfig()
  const privateLink = privateLinkUrl(config.public.appUrl, rawToken)
  const whatsappUrl = whatsappShareUrl(config.demoWhatsappNumber, `My GoodCane Drops link (demo): ${privateLink}`)
  return { privateLink, whatsappUrl }
}
