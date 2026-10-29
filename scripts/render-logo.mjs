/**
 * Gera o PNG do logo (512 e 1024) a partir do SVG, usando Chrome headless.
 * Rodar: node scripts/render-logo.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const svgPath = path.join(root, 'public', 'images', 'diarialog-logo.svg')
const outDir = path.join(root, 'public', 'images')

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p)) ?? null

if (!chrome) {
  console.error('Chrome não encontrado — pulando PNG.')
  process.exit(0)
}

const svg = fs.readFileSync(svgPath, 'utf8')
const inner = svg.replace(/<\?xml[^>]*\?>/, '').replace(/<svg([^>]*)>/, '<svg$1>')

function render(size, fileName) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    .wrap{width:${size}px;height:${size}px;display:grid;place-items:center}
    svg{width:${size}px;height:${size}px;display:block}
  </style></head><body><div class="wrap">${inner}</div></body></html>`
  const htmlPath = path.join(here, '.logo-render.html')
  fs.writeFileSync(htmlPath, html, 'utf8')
  const out = path.join(outDir, fileName)
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      `--window-size=${size},${size}`,
      `--screenshot=${out}`,
      `file:///${htmlPath.replace(/\\/g, '/')}`,
    ],
    { stdio: 'ignore' },
  )
  fs.rmSync(htmlPath, { force: true })
  console.log(`ok: ${fileName} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`)
}

render(192, 'diarialog-logo-192.png')
render(512, 'diarialog-logo-512.png')
render(1024, 'diarialog-logo-1024.png')
