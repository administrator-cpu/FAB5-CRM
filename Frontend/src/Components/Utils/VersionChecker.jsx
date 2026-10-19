import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import toast from 'react-hot-toast'

const CURRENT_VERSION = __APP_VERSION__
const POLL_INTERVAL = 5 * 60 * 1000 // 5 min
const MIN_GAP = 30 * 1000 // don't re-check more often than this on focus / route change
const TOAST_ID = 'app-update-available'

async function fetchLatestVersion() {
  const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!res.ok) return null
  // If version.json is missing, the SPA rewrite returns index.html; ignore that.
  if (!res.headers.get('content-type')?.includes('json')) return null
  const data = await res.json()
  return data?.version || null
}

function showUpdateToast() {
  toast(
    (t) => (
      <div className="flex items-center gap-3 text-sm">
        <span>A new version is available.</span>
        <button
          onClick={() => window.location.reload()}
          className="px-3 py-1 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700"
        >
          Refresh
        </button>
        <button
          onClick={() => toast.dismiss(t.id)}
          className="text-gray-500 hover:text-gray-700"
          aria-label="Dismiss"
        >
          Later
        </button>
      </div>
    ),
    { id: TOAST_ID, duration: Infinity, position: 'bottom-center' }
  )
}

let lastCheck = 0
let notified = false

async function checkForUpdate(force = false) {
  if (!import.meta.env.PROD || notified) return
  const now = Date.now()
  if (!force && now - lastCheck < MIN_GAP) return
  lastCheck = now
  try {
    const latest = await fetchLatestVersion()
    if (latest && latest !== CURRENT_VERSION) {
      notified = true
      showUpdateToast()
    }
  } catch {
    // offline / network blip: try again next time
  }
}

// Polls /version.json and offers a refresh when a newer build has been deployed.
// Never reloads on its own, so users mid-form don't lose their input.
export default function VersionChecker() {
  const location = useLocation()

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }
    const interval = setInterval(() => checkForUpdate(true), POLL_INTERVAL)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [])

  useEffect(() => {
    checkForUpdate()
  }, [location.pathname])

  return null
}
