/**
 * Depura o campo de horário: digita tecla a tecla e mostra o valor + o cursor.
 * Uso: node scripts/debug-time-field.mjs [url]
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const url = process.argv[2] || 'http://localhost:4180/'
const chrome = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p))
if (!chrome) {
  console.error('Chrome nao encontrado.')
  process.exit(1)
}

const port = 9700 + Math.floor(Math.random() * 150)
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-dbg-'))
const proc = spawn(
  chrome,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--hide-scrollbars',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

try {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (res.ok) break
    } catch {
      /* subindo */
    }
    await sleep(250)
  }
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
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }))
  await send('Page.enable')
  await send('Runtime.enable')
  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    return res.result.value
  }

  await send('Page.navigate', { url })
  await sleep(3000)

  const box = await evaluate(`(() => {
    const el = document.querySelector('#dl-start');
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width * 0.5, y: r.y + r.height / 2 };
  })()`)
  await sleep(200)
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
  await sleep(300)

  const hit = await evaluate(`(() => {
    const el = document.querySelector('#dl-start');
    const r = el.getBoundingClientRect();
    const x = r.x + r.width * 0.5, y = r.y + r.height / 2;
    const alvo = document.elementFromPoint(x, y);
    return JSON.stringify({
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      ponto: { x: Math.round(x), y: Math.round(y) },
      alvo: alvo ? alvo.tagName + '#' + alvo.id + '.' + String(alvo.className || '').slice(0, 30) : 'nada',
      janela: { w: window.innerWidth, h: window.innerHeight },
      scrollY: window.scrollY,
      focado: document.activeElement ? document.activeElement.id : 'nenhum',
    });
  })()`)
  console.log('alvo do clique:', hit)

  const dump = async (label) => {
    const info = await evaluate(`(() => {
      const el = document.querySelector('#dl-start');
      return { value: el.value, start: el.selectionStart, end: el.selectionEnd };
    })()`)
    console.log(`${label.padEnd(14)} valor="${info.value}" cursor=${info.start}`)
  }

  await dump('após o clique')

  // instrumenta o campo para ver quais eventos chegam
  await evaluate(`(() => {
    window.__log = [];
    const el = document.querySelector('#dl-start');
    for (const ev of ['keydown', 'beforeinput', 'input']) {
      el.addEventListener(ev, (e) => {
        window.__log.push(ev + ':' + (e.data ?? e.key ?? '') + '=>' + el.value);
      });
    }
    return true;
  })()`)

  for (const ch of ['0', '8', '4', '5']) {
    await send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: ch,
      unmodifiedText: ch,
      key: ch,
      code: `Digit${ch}`,
      windowsVirtualKeyCode: ch.charCodeAt(0),
    })
    await send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: ch,
      code: `Digit${ch}`,
      windowsVirtualKeyCode: ch.charCodeAt(0),
    })
    await sleep(250)
    await dump(`digitou "${ch}"`)
  }

  const log = await evaluate(`JSON.stringify(window.__log || [])`)
  console.log('eventos:', log)
  ws.close()
} catch (err) {
  console.error('falha:', err.message)
} finally {
  try {
    proc.kill()
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
}
