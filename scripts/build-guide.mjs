/**
 * Pipeline completo do guia em PDF:
 *   1. renderiza o HTML em PDF (Chrome --print-to-pdf)
 *   2. aplica marcadores (outline) e metadados
 *   3. copia o resultado para public/ (o que o site serve)
 *
 * Uso: node scripts/build-guide.mjs
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const html = path.join(root, 'guide', 'guia.html')
const pdf = path.join(root, 'guide', 'guia-diarialog.pdf')
const out = path.join(root, 'public', 'guia-diarialog.pdf')

const run = (script, ...args) => {
  console.log(`\n=== ${path.basename(script)} ===`)
  const r = spawnSync(process.execPath, [path.join(here, script), ...args], {
    stdio: 'inherit',
    cwd: root,
  })
  if (r.status !== 0) {
    console.error(`falhou: ${script}`)
    process.exit(r.status ?? 1)
  }
}

run('render-guide-cli.mjs', html, pdf)
run('add-guide-links.mjs', html, pdf)
run('verify-pdf.mjs', pdf)

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.copyFileSync(pdf, out)
console.log(`\ncopiado para public/guia-diarialog.pdf (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`)
