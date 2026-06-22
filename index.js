/**
 * Bot WhatsApp — Chocolate Pasión (y futuros clientes)
 * Usa Baileys como transporte, Claude API como cerebro
 * Equivale a lo que hoy hace Claude Code + Chrome, pero en servidor 24/7
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys')
const pino = require('pino')
const fs = require('fs')
const path = require('path')

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
// Para cada cliente, crear su propio archivo en config/
// Ejemplo: config/chocolate_pasion.json
const CLIENTE_ID = process.env.CLIENTE_ID || 'chocolate_pasion'
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY  // poner en variable de entorno

const configPath = path.join(__dirname, 'config', `${CLIENTE_ID}.json`)
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

// Historial de conversaciones en memoria (número → array de mensajes)
// En producción esto debería ir a una base de datos
const conversaciones = {}

// ─── FUNCIÓN PRINCIPAL ────────────────────────────────────────────────────────
async function conectarWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, 'sesiones', CLIENTE_ID)
  )

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true,
    browser: ['Chrome (Linux)', 'Chrome', '120.0.0'],  // simular navegador real
  })

  sock.ev.on('creds.update', saveCreds)

  // ─── RECEPCIÓN DE MENSAJES ─────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      // Ignorar mensajes propios, grupos, y estados
      if (!msg.message) continue
      if (msg.key.fromMe) continue
      if (msg.key.remoteJid === 'status@broadcast') continue
      if (msg.key.remoteJid.includes('@g.us')) continue  // grupos

      const numero = msg.key.remoteJid.replace('@s.whatsapp.net', '')
      const texto = extraerTexto(msg)

      if (!texto) continue  // audios, imágenes sin caption, etc.

      console.log(`\n📩 [${CLIENTE_ID}] ${numero}: ${texto.slice(0, 80)}`)

      try {
        // Simular que está leyendo (presencia "online")
        await sock.sendPresenceUpdate('available', msg.key.remoteJid)

        // Delay antes de empezar a "escribir" (entre 1 y 3 segundos — leer primero)
        await delay(randomEntre(1000, 3000))

        // Mostrar indicador "escribiendo..."
        await sock.sendPresenceUpdate('composing', msg.key.remoteJid)

        // Llamar a Claude API con todo el contexto
        const respuesta = await llamarClaude(texto, numero, config)

        // Delay proporcional al largo de la respuesta (simula tiempo de escritura)
        // ~40 palabras por minuto → ~150ms por palabra → ajustar a gusto
        const palabras = respuesta.split(' ').length
        const tiempoEscritura = Math.min(palabras * 100, 5000)  // máximo 5 seg
        await delay(tiempoEscritura)

        // Si la respuesta tiene múltiples burbujas (separadas por \n---\n), enviarlas por separado
        const burbujas = respuesta.split('\n---\n').map(b => b.trim()).filter(Boolean)

        for (let i = 0; i < burbujas.length; i++) {
          await sock.sendMessage(msg.key.remoteJid, { text: burbujas[i] })

          // Entre burbuja y burbuja: pequeña pausa + volver a "escribiendo"
          if (i < burbujas.length - 1) {
            await delay(randomEntre(800, 2000))
            await sock.sendPresenceUpdate('composing', msg.key.remoteJid)
            await delay(randomEntre(1000, 2500))
          }
        }

        // Marcar como leído
        await sock.readMessages([msg.key])

        console.log(`✅ Respondido a ${numero}`)

      } catch (error) {
        console.error(`❌ Error procesando mensaje de ${numero}:`, error.message)
      }
    }
  })

  // ─── CONEXIÓN / RECONEXIÓN ─────────────────────────────────────────────────
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Escanea el QR con WhatsApp > Dispositivos vinculados:\n')
    }

    if (connection === 'close') {
      const codigo = lastDisconnect?.error?.output?.statusCode
      const debeReconectar = codigo !== DisconnectReason.loggedOut

      if (debeReconectar) {
        console.log(`🔄 Desconectado (código ${codigo}). Reconectando en 5s...`)
        setTimeout(conectarWhatsApp, 5000)
      } else {
        console.log('❌ Sesión cerrada (logout). Necesita escanear QR de nuevo.')
        console.log('   Borra la carpeta sesiones/' + CLIENTE_ID + ' y reinicia.')
      }
    }

    if (connection === 'open') {
      console.log(`\n✅ Bot conectado — cliente: ${CLIENTE_ID} (${config.nombre_negocio})\n`)
    }
  })
}

// ─── EXTRAER TEXTO DEL MENSAJE ─────────────────────────────────────────────────
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

// ─── DELAY ALEATORIO ──────────────────────────────────────────────────────────
function randomEntre(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// ─── LLAMAR A CLAUDE API ───────────────────────────────────────────────────────
async function llamarClaude(textoNuevo, numero, config) {
  // Mantener historial por número (últimos 20 mensajes)
  if (!conversaciones[numero]) conversaciones[numero] = []

  conversaciones[numero].push({ role: 'user', content: textoNuevo })
  if (conversaciones[numero].length > 20) conversaciones[numero].shift()

  const systemPrompt = construirSystemPrompt(config)

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
      system: systemPrompt,
      messages: conversaciones[numero],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const respuesta = data.content[0]?.text || 'Un momento, ya te respondo 😊'

  // Guardar respuesta en historial
  conversaciones[numero].push({ role: 'assistant', content: respuesta })

  return respuesta
}

// ─── CONSTRUIR SYSTEM PROMPT DESDE CONFIG DEL CLIENTE ─────────────────────────
function construirSystemPrompt(config) {
  // Este es el equivalente al CLAUDE.md + ENRUTADOR.md + agentes
  // Cada cliente tiene su propio prompt en su config JSON
  return `${config.system_prompt}

---

## REGLAS DE FORMATO DE RESPUESTA

Eres un asistente de WhatsApp. Responde como lo haría una persona real:
- Mensajes cortos y naturales, como se escribe en WhatsApp
- Emojis con moderación (como en el estilo del cliente)
- Si necesitas enviar múltiples mensajes separados, divídelos con \n---\n entre ellos
- NUNCA uses formato markdown (negritas **así**, listas con -, títulos con #)
- Una idea por mensaje, como lo haría un humano
- Máximo 3 burbujas por turno

## DATOS DEL NEGOCIO

${JSON.stringify(config.datos_negocio, null, 2)}

## INSTRUCCIONES ESPECÍFICAS

${config.instrucciones_adicionales || ''}
`
}

// ─── INICIAR ──────────────────────────────────────────────────────────────────
console.log(`\n🤖 Iniciando bot para cliente: ${CLIENTE_ID}`)
console.log(`   Negocio: ${config.nombre_negocio}\n`)

conectarWhatsApp().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
