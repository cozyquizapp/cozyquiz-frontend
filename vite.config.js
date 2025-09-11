import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
  host: true,          // listen on all interfaces (0.0.0.0)
  port: 5173,
  strictPort: true,    // keep fixed for Cloudflare tunnel
  // allow any host (quick tunnels change subdomain on each run)
  allowedHosts: true,
  // Let Vite choose HMR settings dynamically to match the chosen port
  // hmr: { host: process.env.VITE_HMR_HOST || undefined },
    // Do not watch backend files to prevent full reload storms
    watch: {
      ignored: ['**/backend/**']
    }
  },
  preview: {
  host: true, // for preview via local browser; if tunneling preview, prefer 127.0.0.1 using CLI flags
  port: 5173
  }
})
