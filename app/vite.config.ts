import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Cho phép truy cập qua tunnel (ngrok...) khi xem thử từ máy khác.
    allowedHosts: true,
  },
})
