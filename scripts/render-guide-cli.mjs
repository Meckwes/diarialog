/**
 * Renderiza o guia em PDF usando a flag --print-to-pdf do Chrome (headless).
 * O caminho CDP (Page.printToPDF) trava neste documento; a CLI usa o mesmo
 * motor de impressao e funciona.
 *
 * Uso: node scripts/render-guide-cli.mjs [entrada.html] [saida.pdf]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const input = path.resolve(process.argv[2] || path.resolve(process.cwd(), 'guide', 'guia.html'))
const output = path.resolve(process.argv[3] || path.resolve(process.cwd(), 'guide', 'guia-diarialog.pdf'))

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p))
if (!chrome) {
  console.error('Chrome nao encontrado.')
  process.exit(1)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'guide-cli-'))
const profile = path.join(tmp, 'profile')
const out = path.join(tmp, 'saida.pdf')

const url = pathToFileURL(input).href
const args = [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--force-color-profile=srgb',
  '--run-all-compositor-stages-before-draw',
  '--virtual-time-budget=25000',
  '--no-pdf-header-footer',
  `--user-data-dir=${profile}`,
  `--print-to-pdf=${out}`,
  url,
]

const t0 = Date.now()
const proc = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] })

let stderr = ''
proc.stderr.on('data', (d) => {
  stderr += d.toString()
})

const code = await new Promise((resolve) => {
  const timer = setTimeout(() => {
    proc.kill()
    resolve('TIMEOUT')
  }, 180000)
  proc.on('exit', (c) => {
    clearTimeout(timer)
    resolve(c)
  })
})

if (!fs.existsSync(out)) {
  console.error('falha: PDF nao gerado', code, stderr.slice(-500))
  process.exit(1)
}

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.copyFileSync(out, output)
const size = fs.statSync(output).size
console.log(
  `ok: ${output} (${(size / 1024).toFixed(1)} KB) em ${((Date.now() - t0) / 1000).toFixed(1)}s`,
)

try {
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
} catch {
  /* o SO limpa depois */
}
