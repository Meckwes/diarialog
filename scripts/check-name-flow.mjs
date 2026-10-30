/**
 * Valida o fluxo do nome no app:
 *  1. primeira visita (sem localStorage) → o modal de nome aparece
 *  2. salva o nome → "Olá, Fulano" aparece no topo
 *  3. recarrega → o modal NÃO aparece e a saudação continua
 *
 * Uso: node scripts/check-name-flow.mjs [url] [saida-dir]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const url = process.argv[2] || 'http://localhost:4180/'
const outDir = path.resolve(process.argv[3] || path.resolve(process.cwd(), 'guide-shots'))
fs.mkdirSync(outDir, { recursive: true })

const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p))
if (!chrome) {
  console.error('Chrome nao encontrado.')
  process.exit(1)
}

const port = 9400 + Math.floor(Math.random() * 150)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-name-'))
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-color-profile=srgb',
    '--window-size=1200,1600',
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

let failures = 0
const check = (name, actual, expected) => {
  const ok = String(actual) === String(expected)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` → esperado "${expected}", veio "${actual}"`}`)
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

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return res.result.value
  }

  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    const dest = path.join(outDir, name)
    fs.writeFileSync(dest, Buffer.from(s.data, 'base64'))
    console.log(`     shot: ${dest}`)
  }

  // ---------- 1. primeira visita ----------
  await send('Page.navigate', { url })
  await sleep(3000)

  const dialogOpen = await evaluate(
    `!!document.querySelector('#dl-name') && document.querySelector('#dl-name').offsetParent !== null`,
  )
  check('primeira visita abre o modal de nome', dialogOpen, true)
  const title = await evaluate(`document.querySelector('#name-dialog-title')?.textContent ?? ''`)
  check('título do modal', title, 'Como podemos te chamar?')
  await shot('nome-01-modal.png')

  // ---------- 2. digita e salva ----------
  await evaluate(`
    (() => {
      const input = document.querySelector('#dl-name');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'Pedro Silva');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return input.value;
    })()
  `)
  await sleep(400)
  await evaluate(`
    [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salvar')?.click()
  `)
  await sleep(1200)

  const dialogGone = await evaluate(`!document.querySelector('#dl-name')`)
  check('modal fecha depois de salvar', dialogGone, true)

  const greeting = await evaluate(`
    [...document.querySelectorAll('button')].map(b => b.textContent.trim()).find(t => t.startsWith('Olá')) ?? ''
  `)
  check('saudação mostra o primeiro nome', greeting.replace(/\\s+/g, ' ').trim(), 'Olá, Pedro')
  await shot('nome-02-saudacao.png')

  const saved = await evaluate(`JSON.parse(localStorage.getItem('diarialog.v2') || '{}').name ?? ''`)
  check('nome gravado no localStorage', saved, 'Pedro Silva')

  // ---------- 3. recarrega ----------
  await send('Page.navigate', { url })
  await sleep(3000)
  const dialogAfter = await evaluate(`!!document.querySelector('#dl-name')`)
  check('recarregar NÃO abre o modal de novo', dialogAfter, false)
  const greeting2 = await evaluate(`
    [...document.querySelectorAll('button')].map(b => b.textContent.trim()).find(t => t.startsWith('Olá')) ?? ''
  `)
  check('saudação continua após recarregar', greeting2.replace(/\\s+/g, ' ').trim(), 'Olá, Pedro')

  // ---------- 4. editar o nome ----------
  await evaluate(`
    [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith('Olá'))?.click()
  `)
  await sleep(900)
  const editTitle = await evaluate(`document.querySelector('#name-dialog-title')?.textContent ?? ''`)
  check('clicar na saudação abre a edição', editTitle, 'Seu nome')
  const prefilled = await evaluate(`document.querySelector('#dl-name')?.value ?? ''`)
  check('campo vem preenchido com o nome salvo', prefilled, 'Pedro Silva')
  await shot('nome-03-editar.png')

  ws.close()
  console.log(failures === 0 ? '\n✅ fluxo do nome ok' : `\n❌ ${failures} falha(s)`)
  process.exitCode = failures === 0 ? 0 : 1
} catch (err) {
  console.error('falha:', err.message)
  process.exitCode = 1
} finally {
  cleanup()
}
