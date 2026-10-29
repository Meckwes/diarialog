/**
 * Lista os maiores streams do PDF (streams brutos e decodificados).
 * Uso: node scripts/pdf-streams.mjs [arquivo.pdf]
 */
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'

const file = path.resolve(process.argv[2] || path.resolve(process.cwd(), 'guide', 'guia-diarialog.pdf'))
const bytes = fs.readFileSync(file)
const doc = await PDFDocument.load(bytes, { updateMetadata: false })
const ctx = doc.context

const rows = []
for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
  if (!(obj instanceof PDFRawStream)) continue
  const dict = obj.dict
  const type = dict.get(PDFName.of('Type'))?.toString?.() ?? ''
  const sub = dict.get(PDFName.of('Subtype'))?.toString?.() ?? ''
  const filter = dict.get(PDFName.of('Filter'))?.toString?.() ?? ''
  const base = dict.get(PDFName.of('BaseFont'))?.toString?.() ?? ''
  let raw = obj.getContents().length
  let decoded = raw
  try {
    decoded = obj.getContents().length // conteudo bruto ja e o stream codificado
  } catch {
    /* ignore */
  }
  rows.push({ id: ref.toString(), type, sub, filter, base, kb: raw / 1024 })
}

rows.sort((a, b) => b.kb - a.kb)
console.log(`total streams: ${rows.length} · ${(rows.reduce((s, r) => s + r.kb, 0) / 1024).toFixed(1)} KB`)
console.log('\n--- 15 maiores ---')
for (const r of rows.slice(0, 15)) {
  console.log(
    `${r.kb.toFixed(1).padStart(9)} KB  ${(r.type || '-').padEnd(12)} ${(r.sub || '-').padEnd(14)} ${(r.filter || '-').padEnd(14)} ${r.base}`,
  )
}

const byType = new Map()
for (const r of rows) {
  const key = r.sub || r.type || 'outro'
  byType.set(key, (byType.get(key) ?? 0) + r.kb)
}
console.log('\n--- por categoria ---')
for (const [k, v] of [...byType.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`${(v / 1024).toFixed(1).padStart(9)} KB  ${k}`)
}
