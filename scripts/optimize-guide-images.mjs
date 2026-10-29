/**
 * Recomprime as capturas do guia: PNG gigante -> JPEG redimensionado para resolucao de impressao.
 * Usa o proprio Chrome (canvas) porque nao ha sharp/ImageMagick na maquina.
 *
 * Uso: node scripts/optimize-guide-images.mjs [pasta-assets]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = path.resolve(process.argv[2] || path.resolve(process.cwd(), 'guide', 'assets'))

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p))

if (!chrome) {
  console.error('Chrome nao encontrado.')
  process.exit(1)
}

// largura maxima por tipo de imagem (px) e qualidade do JPEG
const RULES = [
  { file: 'desktop-escala.png', maxW: 1500, quality: 0.84 },
  { file: 'desktop-semanas.png', maxW: 1500, quality: 0.84 },
  { file: 'desktop-conferencia.png', maxW: 1500, quality: 0.84 },
  { file: 'mobile-escala.png', maxW: 720, quality: 0.82 },
]

const port = 9900 + Math.floor(Math.random() * 200)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-img-'))
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
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

  for (const rule of RULES) {
    const src = path.join(dir, rule.file)
    if (!fs.existsSync(src)) {
      console.log(`pula ${rule.file} (nao existe)`)
      continue
    }
    const raw = fs.readFileSync(src)
    const dataUrl = `data:image/png;base64,${raw.toString('base64')}`

    const res = await send('Runtime.evaluate', {
      expression: `(async () => {
        const img = new Image();
        img.src = ${JSON.stringify(dataUrl)};
        await img.decode();
        const scale = Math.min(1, ${rule.maxW} / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const out = c.toDataURL('image/jpeg', ${rule.quality});
        return JSON.stringify({ b64: out.split(',')[1], w, h });
      })()`,
      awaitPromise: true,
      returnByValue: true,
    })

    const parsed = JSON.parse(res.result.value)
    const dest = path.join(dir, rule.file.replace(/\.png$/, '.jpg'))
    const out = Buffer.from(parsed.b64, 'base64')
    fs.writeFileSync(dest, out)
    console.log(
      `${rule.file} -> ${path.basename(dest)} ${parsed.w}x${parsed.h} ${(out.length / 1024).toFixed(1)} KB (era ${(raw.length / 1024).toFixed(1)} KB)`,
    )
  }

  ws.close()
} catch (err) {
  console.error('falha:', err.message)
  process.exitCode = 1
} finally {
  cleanup()
}
