/**
 * Captura screenshot de uma URL via CDP (Chrome headless).
 * Uso: node scripts/shot-url.mjs [url] [saida.png] [largura] [altura] [espera-ms]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const url = process.argv[2]
const out = path.resolve(process.argv[3] || 'shot.png')
const width = Number(process.argv[4] || 1200)
const height = Number(process.argv[5] || 1600)
const wait = Number(process.argv[6] || 6000)

if (!url) {
  console.error('uso: node scripts/shot-url.mjs <url> <saida.png> [w] [h] [espera-ms]')
  process.exit(1)
}

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p))
if (!chrome) {
  console.error('Chrome nao encontrado.')
  process.exit(1)
}

const port = 9500 + Math.floor(Math.random() * 200)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-shot2-'))
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--window-size=1200,1700',
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
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  })

  await send('Page.navigate', { url })
  await sleep(wait)

  const scroll = process.argv[7]
  if (scroll) {
    await send('Runtime.evaluate', {
      expression:
        scroll === 'bottom'
          ? 'window.scrollTo(0, document.body.scrollHeight)'
          : `document.querySelector(${JSON.stringify(scroll)})?.scrollIntoView({block:'center'})`,
    })
    await sleep(1200)
  }

  const title = await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })
  console.log('titulo:', title.result.value)

  const shot = await send('Page.captureScreenshot', { format: 'png' })
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('shot:', out, `${(fs.statSync(out).size / 1024).toFixed(0)} KB`)

  ws.close()
} catch (err) {
  console.error('falha:', err.message)
  process.exitCode = 1
} finally {
  cleanup()
}
