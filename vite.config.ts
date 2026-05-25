import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/pdfjs-dist/cmaps/*', dest: 'cmaps', rename: { stripBase: 3 } },
        { src: 'node_modules/pdfjs-dist/standard_fonts/*', dest: 'standard_fonts', rename: { stripBase: 3 } },
        { src: 'node_modules/pdfjs-dist/wasm/*', dest: 'wasm', rename: { stripBase: 3 } },
        { src: 'node_modules/pdfjs-dist/iccs/*', dest: 'iccs', rename: { stripBase: 3 } },
      ],
    }),
  ],
})
