const SUPABASE_REST_URL =
  import.meta.env.VITE_SUPABASE_REST_URL ?? 'https://beablolnhbgxdvvmvnsz.supabase.co/rest/v1'
const SUPABASE_PUBLIC_KEY =
  import.meta.env.VITE_SUPABASE_PUBLIC_KEY ?? 'sb_publishable_hfIWkwcfezIMx0Leh_gToQ_2cp9b0qV'
const VISITOR_EVENTS_TABLE = import.meta.env.VITE_SUPABASE_VISITOR_TABLE ?? 'visitor_events'

const VISITOR_ID_KEY = 'fan-referee-toolbox:visitor-id'
const SESSION_TRACKED_KEY = 'fan-referee-toolbox:visit-tracked'

function getVisitorId() {
  const existing = window.localStorage.getItem(VISITOR_ID_KEY)
  if (existing) return existing

  const nextId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  window.localStorage.setItem(VISITOR_ID_KEY, nextId)
  return nextId
}

export function trackVisit() {
  if (typeof window === 'undefined') return
  if (window.sessionStorage.getItem(SESSION_TRACKED_KEY)) return

  window.sessionStorage.setItem(SESSION_TRACKED_KEY, '1')

  const payload = {
    visitor_id: getVisitorId(),
    path: window.location.pathname,
    referrer: document.referrer || null,
    user_agent: navigator.userAgent,
    screen_width: window.screen.width,
    screen_height: window.screen.height,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    visited_at: new Date().toISOString(),
  }

  fetch(`${SUPABASE_REST_URL.replace(/\/$/, '')}/${VISITOR_EVENTS_TABLE}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_PUBLIC_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLIC_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(payload),
    keepalive: true,
  })
    .then((response) => {
      if (!response.ok) {
        window.sessionStorage.removeItem(SESSION_TRACKED_KEY)
        console.warn('Supabase visitor tracking failed', response.status, response.statusText)
      }
    })
    .catch((error) => {
      console.warn('Supabase visitor tracking failed', error)
      window.sessionStorage.removeItem(SESSION_TRACKED_KEY)
    })
}
