/**
 * Mede overflow no mobile COM a saudação visível (nome já salvo).
 * Uso: node scripts/check-mobile-name.mjs [url] [saida.png] [nome]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const url = process.argv[2] || 'http://localhost:4180/'
const out = path.resolve(process.argv[3] || path.resolve(process.cwd(), 'guide-shots', 'mobile-nome.png'))
const nome = process.argv[4] || 'Pedro'

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p))
if (!chrome) {
  console.error('Chrome nao encontrado.')
  process.exit(1)
}

const port = 9450 + Math.floor(Math.random() * 100)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-mob-'))
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })

  await send('Page.navigate', { url })
  await sleep(2500)

  // semeia o nome e recarrega
  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('diarialog.v2', JSON.stringify({ shifts: [], deposits: [], settings: { startDow: 2, endDow: 4, monthLimit: 14 }, name: ${JSON.stringify(nome)} }))`,
  })
  await send('Page.navigate', { url })
  await sleep(2500)

  const metrics = await send('Runtime.evaluate', {
    expression: `JSON.stringify({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      greeting: [...document.querySelectorAll('button')].map(b => b.textContent.trim()).find(t => t.startsWith('Olá')) ?? '(sem saudação)',
      modalAberto: !!document.querySelector('#dl-name'),
      estouram: [...document.querySelectorAll('body *')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
      }).slice(0, 5).map(el => el.tagName + '.' + (el.className || '').toString().slice(0, 30)),
    })`,
    returnByValue: true,
  })
  const info = JSON.parse(metrics.result.value)
  console.log('metricas:', JSON.stringify(info))
  console.log(info.scrollWidth === info.clientWidth ? 'ok: sem overflow horizontal' : 'FALHA: overflow horizontal')
  console.log(info.modalAberto ? 'FALHA: modal abriu mesmo com nome salvo' : 'ok: modal não reabriu')

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('shot:', out)

  ws.close()
} catch (err) {
  console.error('falha:', err.message)
  process.exitCode = 1
} finally {
  cleanup()
}
