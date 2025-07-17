import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // Prevent Vite from clearing the screen
  clearScreen: false,
  // Tauri expects a fixed port, defining a default server port.
  server: {
    port: 1420,
    strictPort: true,
  },
  plugins: [react()],
})
