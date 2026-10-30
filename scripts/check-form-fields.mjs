/**
 * Valida os 3 campos do formulário no navegador de verdade:
 *  1. Entrada/Saída: só números, sem relógio nativo ("2300" → "23:00")
 *  2. Valor a receber: "100" → "100,00"
 *  3. Loja / cliente: Shopee, Amazon, Fenix, Outro
 * E registra um turno no fim, para garantir que o valor salvo é o certo.
 *
 * Uso: node scripts/check-form-fields.mjs [url] [saida-dir]
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

const port = 9600 + Math.floor(Math.random() * 150)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-form-'))
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
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text)
    return res.result.value
  }

  const shot = async (name) => {
    const s = await send('Page.captureScreenshot', { format: 'png' })
    const dest = path.join(outDir, name)
    fs.writeFileSync(dest, Buffer.from(s.data, 'base64'))
    console.log(`     shot: ${dest}`)
  }

  /** Clica num campo (como o dedo da pessoa). `lado` = 0 esquerda, 1 direita. */
  const clickField = async (selector, lado = 0.5) => {
    // rola até o campo e espera a rolagem terminar antes de medir
    await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({ block: 'center' })`)
    await sleep(350)
    const box = await evaluate(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width * ${lado}, y: r.y + r.height / 2 };
    })()`)
    if (!box) throw new Error(`campo não encontrado: ${selector}`)
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1,
    })
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: box.x,
      y: box.y,
      button: 'left',
      clickCount: 1,
    })
    await sleep(150)
    const focused = await evaluate(`document.activeElement?.id ?? ''`)
    if (focused !== selector.replace('#', '')) {
      throw new Error(`o clique não focou ${selector} (foco em "${focused}")`)
    }
  }

  /** Digita como teclado de verdade (dispara keydown → o app consegue ler a seleção). */
  const typeText = async (text) => {
    for (const ch of text) {
      const code = /[0-9]/.test(ch) ? `Digit${ch}` : `Key${ch.toUpperCase()}`
      const vk = ch.toUpperCase().charCodeAt(0)
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        text: ch,
        unmodifiedText: ch,
        key: ch,
        code,
        windowsVirtualKeyCode: vk,
      })
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: vk })
      await sleep(60)
    }
    await sleep(150)
  }

  const pressBackspace = async () => {
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Backspace',
      code: 'Backspace',
      windowsVirtualKeyCode: 8,
    })
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Backspace',
      code: 'Backspace',
      windowsVirtualKeyCode: 8,
    })
    await sleep(150)
  }

  const valueOf = (selector) =>
    evaluate(`document.querySelector(${JSON.stringify(selector)})?.value ?? 'SEM CAMPO'`)

  // ---------- prepara a página ----------
  await send('Page.navigate', { url })
  await sleep(3000)

  // fecha o modal do nome (1ª visita)
  const hasModal = await evaluate(`!!document.querySelector('#dl-name')`)
  if (hasModal) {
    await evaluate(`
      (() => {
        const input = document.querySelector('#dl-name');
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Pedro');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `)
    await sleep(400)
    await evaluate(
      `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Salvar')?.click()`,
    )
    await sleep(1200)
  }

  // ---------- 1. tipos de input (sem relógio nativo) ----------
  check('Entrada é campo de texto', await evaluate(`document.querySelector('#dl-start').type`), 'text')
  check('Saída é campo de texto', await evaluate(`document.querySelector('#dl-end').type`), 'text')
  check('Valor é campo de texto', await evaluate(`document.querySelector('#dl-value').type`), 'text')
  check(
    'Entrada só aceita números no teclado do celular',
    await evaluate(`document.querySelector('#dl-start').inputMode`),
    'numeric',
  )
  check(
    'Valor pede teclado decimal',
    await evaluate(`document.querySelector('#dl-value').inputMode`),
    'decimal',
  )

  // ---------- 2. horário digitado ----------
  await clickField('#dl-start')
  await typeText('08')
  check('Entrada: 08 vira 08:00', await valueOf('#dl-start'), '08:00')

  // ajustar os minutos: toca no ":00" e digita 45
  await clickField('#dl-start', 0.8)
  await typeText('45')
  check('Entrada: ajustar o :00 dá 08:45', await valueOf('#dl-start'), '08:45')

  // digitando o horário inteiro de uma vez
  await clickField('#dl-start')
  await typeText('0845')
  check('Entrada: 0845 vira 08:45', await valueOf('#dl-start'), '08:45')

  await clickField('#dl-end')
  await typeText('1745')
  check('Saída: 1745 vira 17:45', await valueOf('#dl-end'), '17:45')

  // ---------- 3. valor completado ----------
  await clickField('#dl-value')
  await typeText('100')
  check('Valor: 100 vira 100,00', await valueOf('#dl-value'), '100,00')

  // ---------- 4. apagar volta um dígito ----------
  await pressBackspace()
  check('Valor: apagar volta para 10,00', await valueOf('#dl-value'), '10,00')
  await typeText('0')
  check('Valor: digitar de novo volta a 100,00', await valueOf('#dl-value'), '100,00')

  // ---------- 5. loja / cliente ----------
  const options = await evaluate(`
    [...document.querySelector('#dl-store').options].map(o => o.value).join(',')
  `)
  check('Lojas na ordem pedida', options, 'Shopee,Amazon,Fenix,Outro')
  check(
    'Loja selecionada por padrão é Shopee',
    await evaluate(`document.querySelector('#dl-store').value`),
    'Shopee',
  )

  await shot('form-01-campos.png')

  // ---------- 6. registra o turno ----------
  await evaluate(`
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Registrar turno'))?.click()
  `)
  await sleep(1200)
  const erro = await evaluate(`document.querySelector('form')?.innerText.match(/Informe.*?\\./)?.[0] ?? ''`)
  check('sem erro de validação', erro, '')

  const salvo = await evaluate(`
    (() => {
      const state = JSON.parse(localStorage.getItem('diarialog.v2') || '{}');
      const s = (state.shifts || [])[0];
      return s ? [s.start, s.end, s.value, s.store].join('|') : 'NADA SALVO';
    })()
  `)
  check('turno salvo com 08:45, 17:45, 100 e Shopee', salvo, '08:45|17:45|100|Shopee')

  // ---------- 7. no celular (390px) ----------
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  })
  await send('Page.navigate', { url })
  await sleep(2500)
  await evaluate(`
    localStorage.setItem('diarialog.v2', JSON.stringify({ shifts: [], deposits: [], settings: { startDow: 2, endDow: 4, monthLimit: 14 }, name: 'Pedro' }))
  `)
  await send('Page.navigate', { url })
  await sleep(2500)

  await clickField('#dl-start')
  await typeText('2300')
  check('celular: 2300 vira 23:00', await valueOf('#dl-start'), '23:00')
  await clickField('#dl-value')
  await typeText('100')
  check('celular: 100 vira 100,00', await valueOf('#dl-value'), '100,00')

  const mobile = await evaluate(`
    JSON.stringify({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      estouram: [...document.querySelectorAll('body *')].filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1);
      }).slice(0, 5).map(el => el.tagName + '.' + (el.className || '').toString().slice(0, 30)),
    })
  `)
  const m = JSON.parse(mobile)
  check('celular: sem rolagem horizontal', m.scrollWidth === m.clientWidth, true)
  check('celular: nada estourando a tela', JSON.stringify(m.estouram), '[]')

  await evaluate(`document.querySelector('#dl-value').scrollIntoView({ block: 'center' })`)
  await sleep(400)
  await shot('form-02-mobile.png')

  ws.close()
  console.log(failures === 0 ? '\n✅ campos do formulário ok' : `\n❌ ${failures} falha(s)`)
  process.exitCode = failures === 0 ? 0 : 1
} catch (err) {
  console.error('falha:', err.message)
  process.exitCode = 1
} finally {
  cleanup()
}
