/// <reference types="vite/client" />

declare module '*.md' {
  const content: { html: string; meta: { title: string; x: number; y: number; corner: 'bl' | 'br' | 'tl' | 'tr' } }
  export default content
}
