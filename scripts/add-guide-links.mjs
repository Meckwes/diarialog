/**
 * Adiciona ao PDF do guia:
 *  1. anotacoes /Link clicaveis no sumario (cada item vai para seu capitulo)
 *  2. outline (marcadores/bookmarks) com os 10 capitulos + capa + sumario
 *
 * A geometria e medida no proprio navegador (mesmo layout do PDF) e
 * convertida de px CSS para pontos PDF.
 *
 * Uso: node scripts/add-guide-links.mjs [guia.html] [guia.pdf]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { PDFDocument, PDFName, PDFHexString, PDFNumber } from 'pdf-lib'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const html = path.resolve(process.argv[2] || path.join(root, 'guide', 'guia.html'))
const pdfPath = path.resolve(process.argv[3] || path.join(root, 'guide', 'guia-diarialog.pdf'))

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p))
if (!chrome) {
  console.error('Chrome nao encontrado.')
  process.exit(1)
}

const port = 9200 + Math.floor(Math.random() * 150)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-links-'))
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--force-color-profile=srgb',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForDevtools() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) return true
    } catch {
      /* subindo */
    }
    await sleep(250)
  }
  return false
}

function cleanup() {
  try {
    proc.kill()
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
  } catch {
    /* ignore */
  }
}

const A4_W = 595.276
const A4_H = 841.89

try {
  // ---------- 1. mede a geometria no navegador ----------
  if (!(await waitForDevtools())) throw new Error('DevTools nao respondeu')
  const created = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
  const target = await created.json()
  const ws = new WebSocket(target.webSocketDebuggerUrl)

  let seq = 0
  const pending = new Map()
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++seq
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    const waiter = pending.get(msg.id)
    if (!waiter) return
    pending.delete(msg.id)
    if (msg.error) waiter.reject(new Error(`${msg.error.message} (${method})`))
    else waiter.resolve(msg.result)
  })

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: pathToFileURL(html).href })
  await sleep(2500)

  const geoRes = await send('Runtime.evaluate', {
    expression: `(async () => {
      if (document.fonts) await document.fonts.ready;
      await new Promise(r => setTimeout(r, 300));
      const pages = [...document.querySelectorAll('.page')];
      const scale = ${A4_W} / pages[0].getBoundingClientRect().width;
      const idxOf = (el) => pages.findIndex(p => p.contains(el));

      const links = [...document.querySelectorAll('.toc a')].map(a => {
        const pi = idxOf(a);
        const pr = pages[pi].getBoundingClientRect();
        const r = a.getBoundingClientRect();
        return {
          href: a.getAttribute('href'),
          titulo: (a.querySelector('.t') || {}).textContent?.trim() || '',
          pagina: pi + 1,
          rect: [
            Math.round((r.left - pr.left) * scale),
            Math.round((pr.bottom - r.bottom) * scale),
            Math.round((r.right - pr.left) * scale),
            Math.round((pr.bottom - r.top) * scale),
          ],
        };
      });

      const caps = [];
      pages.forEach((p, i) => {
        if (!p.id) return;
        const h = p.querySelector('.section');
        caps.push({ id: p.id, pagina: i + 1, titulo: h ? h.textContent.trim() : p.id });
      });

      const bookmarks = [
        { titulo: 'Capa', pagina: 1 },
        { titulo: 'Sumário', pagina: 2 },
        ...caps,
        { titulo: 'Guia de bolso', pagina: pages.length },
      ];

      return JSON.stringify({ links, caps, bookmarks, totalPaginas: pages.length });
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })

  const geo = JSON.parse(geoRes.result.value)
  ws.close()
  cleanup()

  console.log(`paginas: ${geo.totalPaginas} · links no sumario: ${geo.links.length}`)
  for (const l of geo.links) {
    const cap = geo.caps.find((c) => `#${c.id}` === l.href)
    console.log(`  ${l.href} -> pagina ${cap ? cap.pagina : '?'} · rect ${l.rect.join(',')}`)
  }

  // ---------- 2. escreve as anotacoes e o outline ----------
  const bytes = fs.readFileSync(pdfPath)
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const ctx = doc.context
  const pages = doc.getPages()

  const capPage = (id) => {
    const c = geo.caps.find((x) => `#${x.id}` === id)
    return c ? c.pagina : null
  }

  // O proprio Chrome ja cria anotacoes /Link para os links internos do HTML,
  // usando named destinations (/cap1 ... /cap10) registradas em /Dests.
  // Nao duplicamos: apenas conferimos.
  let chromeLinks = 0
  for (const page of pages) {
    const annots = page.node.get(PDFName.of('Annots'))
    if (!annots || typeof annots.asArray !== 'function') continue
    for (const ref of annots.asArray()) {
      const dict = ctx.lookup(ref)
      const dest = dict?.get?.(PDFName.of('Dest'))
      if (dest && dest.toString().startsWith('/')) chromeLinks++
    }
  }
  console.log(`anotacoes /Link do Chrome (named destinations): ${chromeLinks}`)

  if (process.argv.includes('--with-links')) {
    let added = 0
    for (const l of geo.links) {
      const target = capPage(l.href)
      if (!target) continue
      const page = pages[l.pagina - 1]
      const targetPage = pages[target - 1]
      const dest = ctx.obj([targetPage.ref, PDFName.of('Fit')])
      const annot = ctx.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: l.rect,
        Border: [0, 0, 0],
        Dest: dest,
      })
      page.node.addAnnot(ctx.register(annot))
      added++
    }
    console.log(`anotacoes /Link adicionais: ${added}`)
  }

  // ---- outline (marcadores) ----
  const outlinesRef = ctx.nextRef()
  const items = geo.bookmarks
  const itemRefs = items.map(() => ctx.nextRef())

  items.forEach((b, i) => {
    const page = pages[b.pagina - 1]
    const dest = ctx.obj([page.ref, PDFName.of('Fit')])
    const dict = ctx.obj({
      Title: PDFHexString.fromText(b.titulo),
      Parent: outlinesRef,
      Dest: dest,
    })
    if (i > 0) dict.set(PDFName.of('Prev'), itemRefs[i - 1])
    if (i < items.length - 1) dict.set(PDFName.of('Next'), itemRefs[i + 1])
    ctx.assign(itemRefs[i], dict)
  })

  const outlines = ctx.obj({
    Type: 'Outlines',
    First: itemRefs[0],
    Last: itemRefs[itemRefs.length - 1],
    Count: PDFNumber.of(items.length),
  })
  ctx.assign(outlinesRef, outlines)
  doc.catalog.set(PDFName.of('Outlines'), outlinesRef)
  console.log(`marcadores no outline: ${items.length}`)

  // metadados
  doc.setTitle('DiáriaLog · Guia rápido')
  doc.setAuthor('Wesley Carvalho')
  doc.setSubject('Guia rápido do DiáriaLog — controle de escala, demandas e repasse')
  doc.setKeywords(['DiáriaLog', 'guia', 'escala', 'repasse', 'Amazon', 'Shopee'])
  doc.setProducer('DiáriaLog')
  doc.setCreator('DiáriaLog')

  const out = await doc.save({ useObjectStreams: true })
  fs.writeFileSync(pdfPath, out)
  console.log(
    `ok: ${pdfPath} (${(out.length / 1024).toFixed(1)} KB) · ${doc.getPageCount()} paginas`,
  )
} catch (err) {
  console.error('falha:', err.message)
  process.exitCode = 1
  cleanup()
}
