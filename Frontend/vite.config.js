import process from 'node:process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Unique id for every build. Shipped inside the bundle (__APP_VERSION__) and
// as /version.json so open tabs can detect that a newer deploy is live.
const sha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local'
const APP_VERSION = process.env.APP_VERSION || `${sha}-${Date.now()}`

function appVersionPlugin() {
  return {
    name: 'app-version',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: APP_VERSION, builtAt: new Date().toISOString() }),
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), appVersionPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
})
