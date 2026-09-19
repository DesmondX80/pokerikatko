import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/pokerikatko/', // Korvaa tämä oman repositoriosi nimellä!
})