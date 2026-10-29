/**
 * Copia o app DiáriaLog para o projeto standalone e converte o tema escuro → claro.
 * Rodar: node scripts/clone-light.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const source = path.resolve(here, '../../wesley-portfolio-v2/src/diarialog')
const target = path.resolve(here, '../src/diarialog')

const MAP = [
  // superfícies
  ['bg-ink-950/85', 'bg-white/90'],
  ['bg-ink-950/80', 'bg-white/90'],
  ['bg-ink-950/70', 'bg-white/90'],
  ['bg-ink-950/60', 'bg-white'],
  ['bg-ink-950/50', 'bg-slate-100'],
  ['bg-ink-950', 'bg-slate-50'],
  ['bg-ink-900/70', 'bg-white'],
  ['bg-ink-900/60', 'bg-white'],
  ['bg-ink-900/50', 'bg-white'],
  ['bg-ink-900', 'bg-white'],
  ['bg-ink-850', 'bg-slate-100'],
  ['bg-ink-800', 'bg-slate-100'],
  ['bg-ink-700', 'bg-slate-100'],
  // brancas translúcidas → cinzas claros
  ['bg-white/[0.06]', 'bg-slate-100'],
  ['bg-white/[0.05]', 'bg-slate-100'],
  ['bg-white/[0.04]', 'bg-slate-100'],
  ['bg-white/[0.03]', 'bg-slate-100'],
  ['bg-white/[0.02]', 'bg-white'],
  // bordas
  ['border-white/[0.14]', 'border-slate-300'],
  ['border-white/[0.12]', 'border-slate-200'],
  ['border-white/[0.1]', 'border-slate-200'],
  ['border-white/[0.08]', 'border-slate-200'],
  ['border-white/20', 'border-slate-300'],
  ['border-white/10', 'border-slate-200'],
  // textos
  ['text-slate-50', 'text-slate-900'],
  ['text-slate-100', 'text-slate-900'],
  ['text-slate-200', 'text-slate-800'],
  ['text-slate-300', 'text-slate-700'],
  ['text-slate-400', 'text-slate-600'],
  ['text-slate-600', 'text-slate-500'],
  ['text-slate-700', 'text-slate-400'],
  ['text-white', 'text-slate-900'],
  // acentos com contraste em fundo claro
  ['text-lime', 'text-lime-700'],
  ['text-ember', 'text-ember-600'],
  ['text-azure', 'text-azure-600'],
  ['placeholder:text-slate-500', 'placeholder:text-slate-400'],
]

const files = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else files.push(full)
  }
}
walk(source)

let changed = 0
for (const file of files) {
  const rel = path.relative(source, file)
  const to = path.join(target, rel)
  fs.mkdirSync(path.dirname(to), { recursive: true })

  let content = fs.readFileSync(file, 'utf8')
  if (file.endsWith('.tsx')) {
    for (const [from, toClass] of MAP) {
      content = content.split(from).join(toClass)
    }
    changed++
  }
  fs.writeFileSync(to, content, 'utf8')
  console.log(`ok: ${rel}`)
}

console.log(`\n${files.length} arquivo(s) copiado(s), ${changed} com tema convertido.`)
