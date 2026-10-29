/**
 * Verifica o PDF gerado: paginas, tamanho, imagens, links internos e metadados.
 * Uso: node scripts/verify-pdf.mjs [arquivo.pdf]
 */
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument, PDFName } from 'pdf-lib'

const file = path.resolve(process.argv[2] || path.resolve(process.cwd(), 'guide', 'guia-diarialog.pdf'))
const bytes = fs.readFileSync(file)
const doc = await PDFDocument.load(bytes, { updateMetadata: false })
const ctx = doc.context

const A4 = { w: 595.28, h: 841.89 }
console.log('arquivo   :', path.basename(file))
console.log('tamanho   :', (bytes.length / 1024).toFixed(1), 'KB')
console.log('paginas   :', doc.getPageCount())

const sizes = new Set()
let links = 0
let totalImages = 0

doc.getPages().forEach((p, i) => {
  const { width, height } = p.getSize()
  sizes.add(`${width.toFixed(1)}x${height.toFixed(1)}`)
  const annots = p.node.get(PDFName.of('Annots'))
  const list = annots && typeof annots.asArray === 'function' ? annots.asArray() : []
  for (const a of list) {
    const dict = ctx.lookup(a)
    const sub = dict?.get?.(PDFName.of('Subtype'))
    if (sub?.toString?.() === '/Link') links++
  }
  const xo = ctx.lookup(p.node.get(PDFName.of('Resources')))?.get?.(PDFName.of('XObject'))
  const xoSize = xo ? (xo.asArray?.() ?? []).length : 0
  totalImages += xoSize
})

console.log('tamanhos  :', [...sizes].join(' | '))
const a4 = [...sizes].every((s) => {
  const [w, h] = s.split('x').map(Number)
  return Math.abs(w - A4.w) < 3 && Math.abs(h - A4.h) < 3
})
console.log('A4 exato  :', a4 ? 'sim' : 'NAO')
console.log('links int.:', links)
console.log('imagens   :', totalImages, 'XObjects')
console.log('titulo    :', doc.getTitle() || '(sem)')
console.log('autor     :', doc.getAuthor() || '(sem)')
