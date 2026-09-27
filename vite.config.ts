import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const here = fileURLToPath(new URL('.', import.meta.url))

function localPrecacheManifest(): Plugin {
  return {
    name: 'nook-local-precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const hash = createHash('sha256')
      const assets = new Set([
        './',
        './index.html',
        './manifest.webmanifest',
        './favicon.svg',
        './icons/nook-192-v2.png',
        './icons/nook-512-v2.png',
      ])
      Object.entries(bundle).forEach(([fileName, output]) => {
        assets.add(`./${fileName}`)
        hash.update(fileName)
        hash.update(output.type === 'chunk' ? output.code : output.source)
      })
      for (const path of ['app/index.html', 'app/public/sw.js', 'app/public/manifest.webmanifest', 'app/public/favicon.svg', 'app/public/icons/nook-192-v2.png', 'app/public/icons/nook-512-v2.png']) {
        try { hash.update(readFileSync(new URL(path, import.meta.url))) } catch { /* optional public file */ }
      }
      this.emitFile({
        type: 'asset',
        fileName: 'nook-precache-manifest.json',
        source: JSON.stringify({ revision: hash.digest('hex').slice(0, 20), assets: [...assets] }),
      })
    },
  }
}

export default defineConfig({
  root: 'app',
  base: './',
  plugins: [react(), tailwindcss(), localPrecacheManifest()],
  resolve: { alias: { '@': fileURLToPath(new URL('./app/src', import.meta.url)) } },
  build: { outDir: fileURLToPath(new URL('./dist', import.meta.url)), emptyOutDir: true },
  server: { fs: { allow: [here] } },
  test: { globals: true, environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
})
