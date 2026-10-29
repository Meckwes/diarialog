/**
 * Inspecao profunda do PDF: streams, imagens (filtro/dimensoes/tamanho), fontes e anotacoes.
 * Uso: node scripts/inspect-pdf.mjs [arquivo.pdf]
 */
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'

const file = path.resolve(process.argv[2] || path.resolve(process.cwd(), 'guide', 'guia-diarialog.pdf'))
const bytes = fs.readFileSync(file)
const doc = await PDFDocument.load(bytes, { updateMetadata: false })

const ctx = doc.context
console.log('arquivo :', path.basename(file), `(${(bytes.length / 1024).toFixed(1)} KB)`)
console.log('paginas :', doc.getPageCount())

let imgTotal = 0
const imgRows = []
let fontTotal = 0
const fontRows = []
let linkCount = 0
const linkPages = new Set()

doc.getPages().forEach((page, idx) => {
  const res = ctx.lookup(page.node.Resources())
  const xo = res?.get?.(PDFName.of('XObject'))
  if (xo) {
    const xoDict = ctx.lookup(xo)
    for (const [, ref] of xoDict.entries()) {
      const stream = ctx.lookup(ref)
      if (!(stream instanceof PDFRawStream)) continue
      const dict = stream.dict
      const w = dict.get(PDFName.of('Width'))?.toNumber?.() ?? 0
      const h = dict.get(PDFName.of('Height'))?.toNumber?.() ?? 0
      const filter = dict.get(PDFName.of('Filter'))?.toString?.() ?? '(nenhum)'
      const len = stream.getContents().length
      imgTotal += len
      imgRows.push({ pag: idx + 1, w, h, filter, kb: len / 1024 })
    }
  }
  const fonts = res?.get?.(PDFName.of('Font'))
  if (fonts) {
    const fDict = ctx.lookup(fonts)
    for (const [, ref] of fDict.entries()) {
      const f = ctx.lookup(ref)
      const desc = ctx.lookup(f?.get?.(PDFName.of('FontDescriptor')))
      const ff = desc?.get?.(PDFName.of('FontFile2')) ?? desc?.get?.(PDFName.of('FontFile3'))
      if (ff) {
        const st = ctx.lookup(ff)
        const len = st?.getContents?.().length ?? 0
        fontTotal += len
        fontRows.push({
          pag: idx + 1,
          sub: f?.get?.(PDFName.of('Subtype'))?.toString?.() ?? '?',
          base: f?.get?.(PDFName.of('BaseFont'))?.toString?.() ?? '?',
          kb: len / 1024,
        })
      }
    }
  }
  const annots = page.node.get(PDFName.of('Annots'))
  const list = annots && typeof annots.asArray === 'function' ? annots.asArray() : []
  for (const a of list) {
    const d = ctx.lookup(a)
    const st = d?.get?.(PDFName.of('Subtype'))?.toString?.()
    if (st === '/Link') {
      linkCount++
      linkPages.add(idx + 1)
      const dest = d?.get?.(PDFName.of('Dest'))
      const act = d?.get?.(PDFName.of('A'))
      console.log(
        '  link na pagina',
        idx + 1,
        dest ? `dest=${dest.toString().slice(0, 40)}` : act ? 'acao externa' : 'sem destino',
      )
    }
  }
})

console.log('\n--- imagens ---')
for (const r of imgRows) {
  console.log(
    `p${String(r.pag).padStart(2)} ${String(r.w).padStart(5)}x${String(r.h).padEnd(5)} ${r.filter.padEnd(14)} ${r.kb.toFixed(1)} KB`,
  )
}
console.log(`total imagens: ${(imgTotal / 1024).toFixed(1)} KB em ${imgRows.length} XObjects`)

console.log('\n--- fontes embutidas ---')
const seen = new Set()
for (const r of fontRows) {
  const key = `${r.base}|${r.sub}`
  if (seen.has(key)) continue
  seen.add(key)
  console.log(`${r.base.padEnd(34)} ${r.sub.padEnd(12)} ${r.kb.toFixed(1)} KB`)
}
console.log(`total fontes: ${(fontTotal / 1024).toFixed(1)} KB`)

console.log('\n--- anotacoes ---')
console.log('links:', linkCount, 'em paginas', [...linkPages].join(', ') || '(nenhuma)')
