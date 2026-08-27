import { defineConfig } from 'vite'

export default defineConfig({
  root: '.',
  base: process.env.VITE_BASE || '/',
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
})
