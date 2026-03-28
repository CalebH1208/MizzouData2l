import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { marked } from 'marked'
import path from 'path'

function markdownPlugin(): Plugin {
  return {
    name: 'vite-plugin-md-to-html',
    transform(code, id) {
      if (!id.endsWith('.md')) return null

      let meta: { title: string; x: number; y: number; corner: string } = { title: '', x: 20, y: 20, corner: 'bl' }
      let body = code
      const fmMatch = code.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/)
      if (fmMatch) {
        const fmLines = fmMatch[1].split('\n')
        for (const line of fmLines) {
          const [key, ...rest] = line.split(':')
          const val = rest.join(':').trim()
          if (key.trim() === 'title') meta.title = val
          if (key.trim() === 'x') meta.x = parseInt(val) || 20
          if (key.trim() === 'y') meta.y = parseInt(val) || 20
          if (key.trim() === 'corner') meta.corner = val
        }
        body = fmMatch[2]
      }

      const html = marked.parse(body, { async: false }) as string
      return {
        code: `export default ${JSON.stringify({ html, meta })};`,
        map: null,
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), markdownPlugin()],
  resolve: {
    alias: {
      '@docs': path.resolve(__dirname, '../documentation'),
    },
  },
})
