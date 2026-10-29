/**
 * Screenshot com emulação real de celular (Chrome DevTools Protocol).
 * Uso: node scripts/screenshot-mobile.mjs <url> <arquivo.png> [largura] [altura]
 *
 * O --window-size do Chrome headless tem largura minima no Windows (~500px),
 * o que corta o print. Aqui forcamos a viewport via Emulation.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const url = process.argv[2] || 'https://diarialog.vercel.app'
const out = process.argv[3] || 'mobile-check.png'
const width = Number(process.argv[4] || 390)
const height = Number(process.argv[5] || 844)

const chrome =
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].find((p) => fs.existsSync(p)) ?? null

if (!chrome) {
  console.error('Chrome nao encontrado.')
  process.exit(1)
}

const port = 9300 + Math.floor(Math.random() * 300)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-'))

const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
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
      /* ainda subindo */
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
    /* o Chrome ainda pode estar fechando o perfil — o temp e limpo pelo SO */
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
    if (msg.error) waiter.reject(new Error(`${msg.error.message} (${methodOf(msg)})`))
    else waiter.resolve(msg.result)
  })
  function methodOf() {
    return 'cdp'
  }

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: true,
    screenWidth: width,
    screenHeight: height,
  })
  await send('Emulation.setTouchEmulationEnabled', { enabled: true })

  await send('Page.navigate', { url })
  await sleep(4500)

  const metrics = await send('Runtime.evaluate', {
    expression:
      'JSON.stringify({scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, innerWidth: window.innerWidth, title: document.title})',
    returnByValue: true,
  })
  console.log('metricas:', metrics.result.value)

  const overflow = await send('Runtime.evaluate', {
    expression: `JSON.stringify([...document.querySelectorAll('body *')].map(el => { const r = el.getBoundingClientRect(); return { tag: el.tagName, cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70), right: Math.round(r.right), left: Math.round(r.left), w: Math.round(r.width) } }).filter(o => o.right > document.documentElement.clientWidth + 0.5 || o.left < -0.5).slice(0, 12))`,
    returnByValue: true,
  })
  console.log('elementos que estouram a viewport:')
  console.log(overflow.result.value)

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log(`ok: ${out} (${(fs.statSync(out).size / 1024).toFixed(1)} KB) @ ${width}x${height}`)
  ws.close()
} catch (err) {
  console.error('falha:', err.message)
  process.exitCode = 1
} finally {
  cleanup()
}
