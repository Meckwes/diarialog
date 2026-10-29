/**
 * Captura telas reais do app (desktop + mobile) pra usar no guia em PDF.
 * Usa Chrome DevTools Protocol — nao precisa de Playwright.
 * Uso: node scripts/capture-app-screens.mjs [baseUrl] [outDir]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const baseUrl = process.argv[2] || 'http://localhost:4180/?demo=1'
const outDir = process.argv[3] || path.resolve(process.cwd(), 'guide-assets')

fs.mkdirSync(outDir, { recursive: true })

const chrome =
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].find((p) => fs.existsSync(p)) ?? null

if (!chrome) {
  console.error('Chrome nao encontrado.')
  process.exit(1)
}

const port = 9400 + Math.floor(Math.random() * 300)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-shot-'))
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
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
    /* o SO limpa depois */
  }
}

const SHOTS = [
  { name: 'desktop-escala', tab: 'Escala', width: 1280, height: 900 },
  { name: 'desktop-semanas', tab: 'Semanas', width: 1280, height: 900 },
  { name: 'desktop-conferencia', tab: 'Conferência', width: 1280, height: 900 },
  { name: 'mobile-escala', tab: 'Escala', width: 390, height: 844 },
]

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
    if (msg.error) waiter.reject(new Error(msg.error.message))
    else waiter.resolve(msg.result)
  })

  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })

  await send('Page.enable')
  await send('Runtime.enable')

  for (const shot of SHOTS) {
    await send('Emulation.setDeviceMetricsOverride', {
      width: shot.width,
      height: shot.height,
      deviceScaleFactor: 2,
      mobile: shot.width < 700,
      screenWidth: shot.width,
      screenHeight: shot.height,
    })
    await send('Page.navigate', { url: baseUrl })
    await sleep(2600)
    // clica na aba pedida
    await send('Runtime.evaluate', {
      expression: `(() => {
        const alvo = ${JSON.stringify(shot.tab)};
        const btn = [...document.querySelectorAll('nav button')].find((b) => b.textContent.trim().startsWith(alvo));
        if (btn) btn.click();
        return !!btn;
      })()`,
      returnByValue: true,
    })
    await sleep(1400)
    await send('Runtime.evaluate', { expression: 'document.fonts ? document.fonts.ready.then(()=>1) : 1', awaitPromise: true })
    const png = await send('Page.captureScreenshot', { format: 'png' })
    const file = path.join(outDir, `${shot.name}.png`)
    fs.writeFileSync(file, Buffer.from(png.data, 'base64'))
    console.log(`ok: ${path.basename(file)} (${(fs.statSync(file).size / 1024).toFixed(1)} KB)`)
  }
  ws.close()
} catch (err) {
  console.error('falha:', err.message)
  process.exitCode = 1
} finally {
  cleanup()
}
