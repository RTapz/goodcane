// Owner pages need the owner session (spec 8). Without it, go to the passcode page.
// The server checks every owner API call as well; this only avoids showing an empty page.
export default defineNuxtRouteMiddleware(async () => {
  const requestFetch = useRequestFetch()
  try {
    await requestFetch('/api/owner/session')
  } catch {
    return navigateTo('/owner/login', { replace: true })
  }
})
