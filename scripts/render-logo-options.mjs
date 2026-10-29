/**
 * Gera uma folha de comparaÃ§Ã£o com os conceitos de logo (grande + tamanho real
 * do cabeÃ§alho) usando Chrome headless.
 * Rodar: node scripts/render-logo-options.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const out = path.join(root, 'logo-options.png')

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p)) ?? null

if (!chrome) {
  console.error('Chrome nÃ£o encontrado â€” pulando render.')
  process.exit(0)
}

const defs = (id) => `
  <defs>
    <linearGradient id="bg${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#BEF264" />
      <stop offset="0.5" stop-color="#84CC16" />
      <stop offset="1" stop-color="#4D7C0F" />
    </linearGradient>
    <linearGradient id="sh${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.38" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
    <clipPath id="cl${id}"><rect width="64" height="64" rx="16" /></clipPath>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#bg${id})" />
  <g clip-path="url(#cl${id})"><rect width="64" height="30" fill="url(#sh${id})" /></g>`

/** A â€” pÃ¡gina de diÃ¡rio + check que escapa do canto */
const A = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  ${defs('A')}
  <rect x="10" y="15" width="30" height="35" rx="9" fill="#0A0F1A" />
  <path d="M16 32.5 L25 41.5 L50 12.5" fill="none" stroke="#F7FEE7" stroke-width="6.5"
        stroke-linecap="round" stroke-linejoin="round" />
</svg>`

/** A2 â€” A + linhas de registro na pÃ¡gina */
const A2 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  ${defs('A2')}
  <rect x="10" y="15" width="30" height="35" rx="9" fill="#0A0F1A" />
  <g stroke="#F7FEE7" stroke-opacity="0.38" stroke-width="3" stroke-linecap="round">
    <path d="M16 23.5 h11" />
    <path d="M16 29.5 h11" />
  </g>
  <path d="M16 32.5 L25 41.5 L50 12.5" fill="none" stroke="#F7FEE7" stroke-width="6.5"
        stroke-linecap="round" stroke-linejoin="round" />
</svg>`

/** A3 â€” A + brilho aurora no tile + check mais forte */
const A3 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    <linearGradient id="bgA3" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#BEF264" />
      <stop offset="0.5" stop-color="#84CC16" />
      <stop offset="1" stop-color="#4D7C0F" />
    </linearGradient>
    <radialGradient id="awA3" cx="0.26" cy="0.14" r="0.72">
      <stop offset="0" stop-color="#F7FEE7" stop-opacity="0.85" />
      <stop offset="1" stop-color="#F7FEE7" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="shA3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.22" />
      <stop offset="1" stop-color="#ffffff" stop-opacity="0" />
    </linearGradient>
    <clipPath id="clA3"><rect width="64" height="64" rx="16" /></clipPath>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#bgA3)" />
  <g clip-path="url(#clA3)">
    <rect width="64" height="30" fill="url(#shA3)" />
    <rect width="64" height="64" fill="url(#awA3)" />
  </g>
  <rect x="10" y="15" width="30" height="35" rx="9" fill="#0A0F1A" />
  <path d="M15.5 32 L25 41.5 L50.5 12" fill="none" stroke="#F7FEE7" stroke-width="7"
        stroke-linecap="round" stroke-linejoin="round" />
</svg>`

/** A4 â€” A com a pÃ¡gina mais "folha" (mais alta) e check mais angular */
const A4 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  ${defs('A4')}
  <rect x="10" y="14" width="29" height="37" rx="10" fill="#0A0F1A" />
  <path d="M15 33 L24.5 42.5 L51 12" fill="none" stroke="#F7FEE7" stroke-width="6.8"
        stroke-linecap="round" stroke-linejoin="round" />
</svg>`

const candidates = [
  { id: 'A', label: 'A Â· base', svg: A },
  { id: 'A2', label: 'A2 Â· + linhas de registro', svg: A2 },
  { id: 'A3', label: 'A3 Â· + aurora e check forte', svg: A3 },
  { id: 'A4', label: 'A4 Â· folha mais alta', svg: A4 },
]

const cell = (c) => `
  <div class="col">
    <div class="big">${c.svg}</div>
    <div class="row">
      <div class="s36">${c.svg}</div>
      <div class="s24">${c.svg}</div>
      <div class="word">DiÃ¡ria<span>Log</span></div>
    </div>
    <div class="label">${c.label}</div>
  </div>`

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#ffffff;font-family:'Segoe UI',system-ui,sans-serif}
  .wrap{padding:28px 30px;display:flex;gap:26px;align-items:flex-start}
  .col{display:flex;flex-direction:column;align-items:center;gap:12px}
  .big svg{width:210px;height:210px;display:block;filter:drop-shadow(0 12px 26px rgba(132,204,22,.55))}
  .row{display:flex;align-items:center;gap:14px;height:44px}
  .s36 svg{width:36px;height:36px}
  .s24 svg{width:24px;height:24px}
  .word{font-size:1.05rem;font-weight:800;letter-spacing:-.02em;color:#0f172a}
  .word span{background:linear-gradient(90deg,#65A30D,#4D7C0F);-webkit-background-clip:text;background-clip:text;color:transparent}
  .label{font-size:12px;color:#64748b;font-weight:600}
</style></head><body><div class="wrap">${candidates.map(cell).join('')}</div></body></html>`

const htmlPath = path.join(here, '.logo-options.html')
fs.writeFileSync(htmlPath, html, 'utf8')
execFileSync(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--default-background-color=00000000',
    '--window-size=1130,340',
    `--screenshot=${out}`,
    `file:///${htmlPath.replace(/\\/g, '/')}`,
  ],
  { stdio: 'ignore' },
)
fs.rmSync(htmlPath, { force: true })
console.log(`ok: ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`)
