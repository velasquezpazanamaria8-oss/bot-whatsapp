const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const QRCode = require('qrcode')
const express = require('express')
const fs = require('fs')
const path = require('path')

const CLIENTE_ID = process.env.CLIENTE_ID || 'chocolate_pasion'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
const PORT = process.env.PORT || 3000

const configPath = path.join(__dirname, 'config', `${CLIENTE_ID}.json`)
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const conversaciones = {}

// ─── SERVIDOR WEB PARA VER EL QR ─────────────────────────────────────────────
const app = express()
let qrActual = null
let botConectado = false

app.get('/', async (req, res) => {
  if (botConectado) {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#fff">
        <h1 style="color:#25D366">✅ Bot conectado</h1>
        <p>El bot de <strong>${config.nombre_negocio}</strong> está activo y recibiendo mensajes.</p>
      </body></html>
    `)
  }
  if (!qrActual) {
    return res.send(`
      <html><head><meta http-equiv="refresh" content="3"></head>
      <body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#fff">
        <h2>⏳ Generando QR...</h2>
        <p>Esta página se actualiza sola. Espera unos segundos.</p>
      </body></html>
    `)
  }
  try {
    const qrImg = await QRCode.toDataURL(qrActual, { width: 400, margin: 2 })
    res.send(`
      <html><head><meta http-equiv="refresh" content="25"></head>
      <body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#fff">
        <h2 style="color:#25D366">📱 Escanea este QR con WhatsApp</h2>
        <img src="${qrImg}" style="border:8px solid white;border-radius:12px;max-width:380px"/>
        <p style="color:#aaa;margin-top:20px">WhatsApp → 3 puntos → Dispositivos vinculados → Vincular dispositivo</p>
        <p style="color:#666;font-size:13px">Esta página se actualiza cada 25 segundos con el QR más reciente</p>
      </body></html>
    `)
  } catch (e) {
    res.send('Error generando QR: ' + e.message)
  }
})

app.listen(PORT, () => {
  console.log(`\n🌐 Abre esta URL para escanear el QR:`)
  console.log(`   (Railway te da la URL pública en Settings > Networking)\n`)
})

// ─── BOT WHATSAPP ─────────────────────────────────────────────────────────────
async function conectarWhatsApp() {
  const { version } = await fetchLatestBaileysVersion()
  console.log(`📡 WhatsApp Web v${version.join('.')}`)

  const sesionPath = path.join(__dirname, 'sesiones', CLIENTE_ID)
  const { state, saveCreds } = await useMultiFileAuthState(sesionPath)
  const logger = pino({ level: 'silent' })

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '120.0.0'],
    syncFullHistory: false,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      qrActual = qr
      botConectado = false
      console.log('📱 QR generado — abre la URL de Railway para escanearlo')
    }

    if (connection === 'close') {
      botConectado = false
      const codigo = lastDisconnect?.error?.output?.statusCode
      if (codigo === DisconnectReason.loggedOut) {
        console.log('❌ Sesión cerrada. Borra sesiones/' + CLIENTE_ID + ' y reinicia.')
      } else {
        console.log(`🔄 Reconectando (código ${codigo})...`)
        setTimeout(conectarWhatsApp, 5000)
      }
    }

    if (connection === 'open') {
      qrActual = null
      botConectado = true
      console.log(`✅ BOT CONECTADO — ${config.nombre_negocio}`)
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (!msg.message) continue
      if (msg.key.fromMe) continue
      if (msg.key.remoteJid === 'status@broadcast') continue
      if (msg.key.remoteJid.includes('@g.us')) continue

      const numero = msg.key.remoteJid.replace('@s.whatsapp.net', '')
      const texto = extraerTexto(msg)
      if (!texto) continue

      console.log(`\n📩 ${numero}: ${texto.slice(0, 80)}`)

      try {
        await sock.sendPresenceUpdate('available', msg.key.remoteJid)
        await delay(randomEntre(1000, 3000))
        await sock.sendPresenceUpdate('composing', msg.key.remoteJid)

        const respuesta = await llamarClaude(texto, numero, config)
        const palabras = respuesta.split(' ').length
        await delay(Math.min(palabras * 100, 5000))

        const burbujas = respuesta.split('\n---\n').map(b => b.trim()).filter(Boolean)
        for (let i = 0; i < burbujas.length; i++) {
          await sock.sendMessage(msg.key.remoteJid, { text: burbujas[i] })
          if (i < burbujas.length - 1) {
            await delay(randomEntre(800, 2000))
            await sock.sendPresenceUpdate('composing', msg.key.remoteJid)
            await delay(randomEntre(1000, 2500))
          }
        }

        await sock.readMessages([msg.key])
        console.log(`✅ Respondido a ${numero}`)

      } catch (error) {
        console.error(`❌ Error:`, error.message)
      }
    }
  })
}

function extraerTexto(msg) {
  const m = msg.message
  return m?.conversation || m?.extendedTextMessage?.text ||
         m?.imageMessage?.caption || m?.videoMessage?.caption || null
}

function randomEntre(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function llamarClaude(textoNuevo, numero, config) {
  if (!conversaciones[numero]) conversaciones[numero] = []
  conversaciones[numero].push({ role: 'user', content: textoNuevo })
  if (conversaciones[numero].length > 20) conversaciones[numero].shift()

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: construirSystemPrompt(config),
      messages: conversaciones[numero],
    }),
  })

  if (!response.ok) throw new Error(`Claude API ${response.status}: ${await response.text()}`)

  const data = await response.json()
  const respuesta = data.content[0]?.text || 'Un momento 😊'
  conversaciones[numero].push({ role: 'assistant', content: respuesta })
  return respuesta
}

function construirSystemPrompt(config) {
  return `${config.system_prompt}

---

## FORMATO WHATSAPP
Responde como persona real. Sin markdown. Múltiples mensajes con \n---\n. Máximo 3 burbujas.

## DATOS DEL NEGOCIO
${JSON.stringify(config.datos_negocio, null, 2)}

## INSTRUCCIONES
${config.instrucciones_adicionales || ''}
`
}

console.log(`\n🤖 Bot iniciando — ${CLIENTE_ID} (${config.nombre_negocio})\n`)
conectarWhatsApp().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})