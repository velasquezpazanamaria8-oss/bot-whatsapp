<<<<<<< HEAD
/**
 * Bot WhatsApp — Sistema multi-cliente
 * Replica exactamente la lógica de Claude Code + Chrome
 * con Baileys como transporte y Claude API como cerebro
 */

=======
>>>>>>> 39bf49c97c7a1c8ed669b9938b0cda3150081223
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

<<<<<<< HEAD
// Cargar config del cliente
const configPath = path.join(__dirname, 'clientes', CLIENTE_ID, 'config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

// Cargar todos los prompts del cliente
const clienteDir = path.join(__dirname, 'clientes', CLIENTE_ID)
const CLAUDE_MD     = fs.readFileSync(path.join(clienteDir, 'CLAUDE.md'), 'utf8')
const ENRUTADOR_MD  = fs.readFileSync(path.join(clienteDir, 'ENRUTADOR.md'), 'utf8')
const AGENTES       = cargarAgentes(clienteDir)

// CRM en memoria (en producción usar SQLite o Postgres)
const crm = {}
// Historial de conversaciones por número
const conversaciones = {}

// ─── SERVIDOR WEB PARA QR ────────────────────────────────────────────────────
=======
const configPath = path.join(__dirname, 'config', `${CLIENTE_ID}.json`)
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
const conversaciones = {}

// ─── SERVIDOR WEB PARA VER EL QR ─────────────────────────────────────────────
>>>>>>> 39bf49c97c7a1c8ed669b9938b0cda3150081223
const app = express()
let qrActual = null
let botConectado = false

app.get('/', async (req, res) => {
  if (botConectado) {
    return res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#fff">
        <h1 style="color:#25D366">✅ Bot conectado</h1>
<<<<<<< HEAD
        <p><strong>${config.nombre_negocio}</strong> está activo y recibiendo mensajes.</p>
=======
        <p>El bot de <strong>${config.nombre_negocio}</strong> está activo y recibiendo mensajes.</p>
>>>>>>> 39bf49c97c7a1c8ed669b9938b0cda3150081223
      </body></html>
    `)
  }
  if (!qrActual) {
    return res.send(`
      <html><head><meta http-equiv="refresh" content="3"></head>
      <body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#fff">
<<<<<<< HEAD
        <h2>⏳ Generando QR...</h2><p>Espera unos segundos, esta página se actualiza sola.</p>
      </body></html>
    `)
  }
  const qrImg = await QRCode.toDataURL(qrActual, { width: 400, margin: 2 })
  res.send(`
    <html><head><meta http-equiv="refresh" content="25"></head>
    <body style="font-family:sans-serif;text-align:center;padding:40px;background:#0a0a0a;color:#fff">
      <h2 style="color:#25D366">📱 Escanea este QR con WhatsApp</h2>
      <img src="${qrImg}" style="border:8px solid white;border-radius:12px;max-width:380px"/>
      <p style="color:#aaa;margin-top:20px">WhatsApp → 3 puntos → Dispositivos vinculados → Vincular dispositivo</p>
      <p style="color:#666;font-size:13px">Se actualiza cada 25 segundos</p>
    </body></html>
  `)
})

app.listen(PORT, () => console.log(`\n🌐 Servidor QR en puerto ${PORT}\n`))

// ─── CARGAR AGENTES ───────────────────────────────────────────────────────────
function cargarAgentes(dir) {
  const agentesDir = path.join(dir, 'agents')
  const agentes = {}
  if (fs.existsSync(agentesDir)) {
    for (const f of fs.readdirSync(agentesDir)) {
      if (f.endsWith('.md')) {
        const nombre = f.replace('.md', '')
        agentes[nombre] = fs.readFileSync(path.join(agentesDir, f), 'utf8')
      }
    }
  }
  return agentes
}

// ─── CRM EN MEMORIA ───────────────────────────────────────────────────────────
function getCRM(numero) {
  if (!crm[numero]) crm[numero] = { stage: 'lead', zona: null, cajas: null, nombre: null }
  return crm[numero]
}

function updateCRM(numero, datos) {
  crm[numero] = { ...getCRM(numero), ...datos, ultima_interaccion: new Date().toISOString() }
  console.log(`📊 CRM ${numero}:`, JSON.stringify(crm[numero]))
}

// ─── ENRUTADOR — decide qué agente usar ──────────────────────────────────────
function detectarAgente(texto, clienteCRM) {
  const t = texto.toLowerCase()
  const stage = clienteCRM.stage || 'lead'

  // SOPORTE — prioridad máxima
  if (/no llegó|no recibí|dónde está|cuándo llega|se perdió|me cobraron|error|equivocado|reclamo|queja|problema|molesto|enojado/.test(t)) {
    return 'soporte'
  }
  if (['despachado', 'entregado'].includes(stage) && texto.length > 5) {
    return 'soporte'
  }

  // POSTVENTA
  if (['yape_pendiente', 'pagado_adelanto'].includes(stage)) return 'postventa'
  if (/yapié|ya pagué|te mandé|te envié|captura|operación|comprobante/.test(t)) return 'postventa'
  if (stage === 'cierre_enviado' && /dirección|cantidad|agencia/.test(t)) return 'postventa'
  if (/cuándo llega|ya salió|el código|voucher/.test(t)) return 'postventa'

  // OBJECIONES
  if (/está caro|es mucho|no tengo|después|lo pienso|funciona|es verdad|garantía|no confío|contraentrega|no quiero adelantar/.test(t)) {
    return 'vendedor' // el vendedor maneja objeciones también
  }

  // VENTA ACTIVA
  if (stage === 'pregunto_zona' || stage === 'cierre_enviado') return 'vendedor'
  if (/quiero|me llevo|sepárame|cuánto es en total|precio/.test(t)) return 'vendedor'
  if (clienteCRM.zona && stage !== 'lead') return 'vendedor'

  // RECOMPRA
  if (stage === 'post_venta_5d') return 'recompra'
  if (stage === 'entregado' && /rico|llegó perfecto|me gustó|gracias/.test(t)) return 'referidos'

  // DEFAULT — bienvenida
  return 'bienvenida'
}

// ─── CONSTRUIR PROMPT COMPLETO ────────────────────────────────────────────────
function construirPrompt(agenteNombre, clienteCRM, numero) {
  const agentePrompt = AGENTES[agenteNombre] || AGENTES['bienvenida'] || ''

  return `${CLAUDE_MD}

---

# ENRUTADOR DE AGENTES
${ENRUTADOR_MD}

---

# AGENTE ACTIVO: ${agenteNombre.toUpperCase()}
${agentePrompt}

---

# ESTADO ACTUAL DEL CLIENTE
- Número: ${numero}
- Stage CRM: ${clienteCRM.stage}
- Zona: ${clienteCRM.zona || 'no definida'}
- Nombre: ${clienteCRM.nombre || 'desconocido'}
- Cajas: ${clienteCRM.cajas || 'no definido'}
- Última interacción: ${clienteCRM.ultima_interaccion || 'primera vez'}

---

# REGLAS DE FORMATO WHATSAPP
- Eres una persona real, cálida, peruana. NUNCA digas que eres bot o IA.
- Mensajes CORTOS como WhatsApp real. Sin markdown (no uses **, #, -).
- Si envías múltiples mensajes, sepáralos con exactamente: \n---\n
- Máximo 4 burbujas por turno.
- Emojis con medida 🍫😊.
- UNA pregunta por mensaje.
- Al final de tu respuesta, agrega en una línea separada:
  [CRM_UPDATE: stage=NUEVO_STAGE zona=ZONA cajas=CAJAS nombre=NOMBRE]
  Solo incluye los campos que cambiaron. Ejemplo: [CRM_UPDATE: stage=pregunto_zona]
  Si no cambia nada, pon: [CRM_UPDATE: sin_cambios]
`
}

// ─── LLAMAR A CLAUDE API ──────────────────────────────────────────────────────
async function llamarClaude(textoNuevo, numero) {
  const clienteCRM = getCRM(numero)
  const agenteNombre = detectarAgente(textoNuevo, clienteCRM)

  console.log(`🤖 Agente: ${agenteNombre} | Stage: ${clienteCRM.stage}`)

  if (!conversaciones[numero]) conversaciones[numero] = []
  conversaciones[numero].push({ role: 'user', content: textoNuevo })
  if (conversaciones[numero].length > 20) conversaciones[numero].shift()

  const systemPrompt = construirPrompt(agenteNombre, clienteCRM, numero)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversaciones[numero],
    }),
  })

  if (!response.ok) throw new Error(`Claude API ${response.status}: ${await response.text()}`)

  const data = await response.json()
  let respuestaCompleta = data.content[0]?.text || 'Un momento 😊'

  // Extraer y procesar CRM update
  const crmMatch = respuestaCompleta.match(/\[CRM_UPDATE:([^\]]+)\]/)
  if (crmMatch && !crmMatch[1].includes('sin_cambios')) {
    const updates = {}
    const partes = crmMatch[1].trim().split(' ')
    for (const p of partes) {
      const [k, v] = p.split('=')
      if (k && v) updates[k.trim()] = v.trim()
    }
    if (Object.keys(updates).length > 0) updateCRM(numero, updates)
  }

  // Limpiar el tag CRM de la respuesta
  const respuestaLimpia = respuestaCompleta.replace(/\[CRM_UPDATE:[^\]]*\]/g, '').trim()

  conversaciones[numero].push({ role: 'assistant', content: respuestaLimpia })
  return respuestaLimpia
}
=======
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
>>>>>>> 39bf49c97c7a1c8ed669b9938b0cda3150081223

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
<<<<<<< HEAD
      console.log('📱 QR generado — abre la URL para escanearlo')
    }
=======
      console.log('📱 QR generado — abre la URL de Railway para escanearlo')
    }

>>>>>>> 39bf49c97c7a1c8ed669b9938b0cda3150081223
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
<<<<<<< HEAD
    if (connection === 'open') {
      qrActual = null
      botConectado = true
      console.log(`\n✅ BOT CONECTADO — ${config.nombre_negocio}\n`)
=======

    if (connection === 'open') {
      qrActual = null
      botConectado = true
      console.log(`✅ BOT CONECTADO — ${config.nombre_negocio}`)
>>>>>>> 39bf49c97c7a1c8ed669b9938b0cda3150081223
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
<<<<<<< HEAD
        await delay(randomEntre(1000, 2500))
        await sock.sendPresenceUpdate('composing', msg.key.remoteJid)

        const respuesta = await llamarClaude(texto, numero)
        const burbujas = respuesta.split('\n---\n').map(b => b.trim()).filter(Boolean)

        const palabras = respuesta.split(' ').length
        await delay(Math.min(palabras * 80, 4000))

        for (let i = 0; i < burbujas.length; i++) {
          await sock.sendMessage(msg.key.remoteJid, { text: burbujas[i] })
          if (i < burbujas.length - 1) {
            await delay(randomEntre(700, 1800))
            await sock.sendPresenceUpdate('composing', msg.key.remoteJid)
            await delay(randomEntre(800, 2000))
=======
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
>>>>>>> 39bf49c97c7a1c8ed669b9938b0cda3150081223
          }
        }

        await sock.readMessages([msg.key])
<<<<<<< HEAD
        console.log(`✅ Respondido (${burbujas.length} burbuja${burbujas.length > 1 ? 's' : ''})`)
=======
        console.log(`✅ Respondido a ${numero}`)
>>>>>>> 39bf49c97c7a1c8ed669b9938b0cda3150081223

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

<<<<<<< HEAD
=======
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

>>>>>>> 39bf49c97c7a1c8ed669b9938b0cda3150081223
console.log(`\n🤖 Bot iniciando — ${CLIENTE_ID} (${config.nombre_negocio})\n`)
conectarWhatsApp().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
<<<<<<< HEAD
})
=======
})
>>>>>>> 39bf49c97c7a1c8ed669b9938b0cda3150081223
