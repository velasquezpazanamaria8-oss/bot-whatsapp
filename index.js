const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys')
const pino = require('pino')
const qrcode = require('qrcode-terminal')
const fs = require('fs')
const path = require('path')

const CLIENTE_ID = process.env.CLIENTE_ID || 'chocolate_pasion'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY

const configPath = path.join(__dirname, 'config', `${CLIENTE_ID}.json`)
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const conversaciones = {}

async function conectarWhatsApp() {
  // Obtener versión más reciente de WhatsApp Web
  const { version } = await fetchLatestBaileysVersion()
  console.log(`📡 Usando WhatsApp Web v${version.join('.')}`)

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

  // ─── QR ───────────────────────────────────────────────
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 ESCANEA ESTE QR CON WHATSAPP:\n')
      qrcode.generate(qr, { small: true })
      console.log('\n(WhatsApp > 3 puntos > Dispositivos vinculados > Vincular dispositivo)\n')
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode
      const esLogout = codigo === DisconnectReason.loggedOut

      if (esLogout) {
        console.log('❌ Sesión cerrada. Borra sesiones/' + CLIENTE_ID + ' y reinicia.')
      } else {
        console.log(`🔄 Desconectado (código ${codigo}). Reconectando en 5s...`)
        setTimeout(conectarWhatsApp, 5000)
      }
    }

    if (connection === 'open') {
      console.log(`\n✅ BOT CONECTADO — ${CLIENTE_ID} (${config.nombre_negocio})\n`)
    }
  })

  // ─── MENSAJES ─────────────────────────────────────────
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

      console.log(`\n📩 [${CLIENTE_ID}] ${numero}: ${texto.slice(0, 80)}`)

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
        console.error(`❌ Error con ${numero}:`, error.message)
      }
    }
  })
}

function extraerTexto(msg) {
  const m = msg.message
  return (
    m?.conversation ||
    m?.extendedTextMessage?.text ||
    m?.imageMessage?.caption ||
    m?.videoMessage?.caption ||
    null
  )
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

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API ${response.status}: ${err}`)
  }

  const data = await response.json()
  const respuesta = data.content[0]?.text || 'Un momento, ya te respondo 😊'

  conversaciones[numero].push({ role: 'assistant', content: respuesta })
  return respuesta
}

function construirSystemPrompt(config) {
  return `${config.system_prompt}

---

## FORMATO WHATSAPP

Responde como persona real en WhatsApp:
- Mensajes cortos y naturales
- Sin markdown (no uses **, #, -)
- Múltiples mensajes separados con \n---\n
- Máximo 3 burbujas por turno

## DATOS DEL NEGOCIO

${JSON.stringify(config.datos_negocio, null, 2)}

## INSTRUCCIONES ESPECÍFICAS

${config.instrucciones_adicionales || ''}
`
}

console.log(`\n🤖 Iniciando bot — cliente: ${CLIENTE_ID} (${config.nombre_negocio})\n`)
conectarWhatsApp().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})