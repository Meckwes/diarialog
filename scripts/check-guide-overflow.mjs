/**
 * Mede overflow de conteudo em cada pagina do guia.
 * Como .page tem overflow:hidden, o excesso e CLIPADO (nao vira scroll),
 * entao comparamos a posicao real dos filhos com a altura util da pagina.
 *
 * Uso: node scripts/check-guide-overflow.mjs [guia.html]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const input = path.resolve(process.argv[2] || path.resolve(process.cwd(), 'guide', 'guia.html'))

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p))
if (!chrome) {
  console.error('Chrome nao encontrado.')
  process.exit(1)
}

const port = 9300 + Math.floor(Math.random() * 150)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-of-'))
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

try {
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
  await send('Page.navigate', { url: pathToFileURL(input).href })
  await sleep(2500)

  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      if (document.fonts) await document.fonts.ready;
      await new Promise(r => setTimeout(r, 300));
      const pages = [...document.querySelectorAll('.page')];
      const out = pages.map((page, i) => {
        const pr = page.getBoundingClientRect();
        const MM = pr.height / 297; // px por mm
        const foot = page.querySelector('.foot');
        const footTop = foot ? foot.getBoundingClientRect().top - pr.top : pr.height;
        const limiteUtil = footTop; // conteudo nao pode passar do rodape
        let pior = { folga: 0, tag: '', texto: '' };
        for (const el of page.children) {
          if (['aurora','grid-bg','foot','cover-strip'].some(c => el.classList.contains(c))) continue;
          const r = el.getBoundingClientRect();
          if (r.height === 0) continue;
          const folga = (r.bottom - pr.top) - limiteUtil;
          if (folga > pior.folga) {
            pior = { folga: folga / MM, tag: el.tagName + '.' + (el.className || '').toString().slice(0, 30), texto: (el.innerText || '').slice(0, 45).replace(/\\s+/g, ' ') };
          }
        }
        const conteudo = [...page.children].filter(el => !['aurora','grid-bg','foot'].some(c => el.classList.contains(c)));
        let maxBottom = 0;
        for (const el of conteudo) {
          const r = el.getBoundingClientRect();
          if (r.height > 0) maxBottom = Math.max(maxBottom, r.bottom - pr.top);
        }
        const temFoot = !!foot;
        return {
          n: i + 1,
          alturaUtil: (limiteUtil / MM).toFixed(1),
          maxBottom: (maxBottom / MM).toFixed(1),
          excesso: ((maxBottom - limiteUtil) / MM).toFixed(1),
          pior: pior.folga > 1 ? pior : null,
          temFoot,
        };
      });
      return JSON.stringify(out);
    })()`,
    awaitPromise: true,
    returnByValue: true,
  })

  const pages = JSON.parse(res.result.value)
  console.log('pág | útil(mm) | conteúdo(mm) | excesso(mm) | detalhe')
  console.log('----+----------+--------------+-------------+--------')
  let problemas = 0
  for (const p of pages) {
    const excesso = Number(p.excesso)
    const sinal = excesso > 0.5 ? ' <<< ESTOURA' : ''
    if (excesso > 0.5) problemas++
    console.log(
      `${String(p.n).padStart(3)} | ${p.alturaUtil.padStart(8)} | ${p.maxBottom.padStart(12)} | ${p.excesso.padStart(11)} | ${p.pior ? p.pior.tag + ' · ' + p.pior.texto : (p.temFoot ? 'ok' : 'sem rodapé')}${sinal}`,
    )
  }
  console.log(`\npáginas com excesso: ${problemas}/${pages.length}`)

  ws.close()
} catch (err) {
  console.error('falha:', err.message)
  process.exitCode = 1
} finally {
  cleanup()
}
