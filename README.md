# Bot WhatsApp — Baileys + Claude API

## Cómo instalar (una sola vez)

```bash
# 1. Instalar Node.js si no lo tienes
# Descargar de: https://nodejs.org/ (versión LTS)

# 2. Ir a la carpeta del bot
cd bot-whatsapp

# 3. Instalar dependencias
npm install
```

## Cómo correr el bot

```bash
# Para Chocolate Pasión (tu negocio actual)
ANTHROPIC_API_KEY=sk-ant-xxxx node index.js

# Para otro cliente (crear su config primero)
CLIENTE_ID=nuevo_cliente ANTHROPIC_API_KEY=sk-ant-xxxx node index.js
```

**La primera vez:** aparecerá un QR en la terminal.
El cliente lo escanea desde WhatsApp > Menú (3 puntos) > Dispositivos vinculados > Vincular dispositivo.
**Solo necesita escanear UNA VEZ** — la sesión queda guardada en sesiones/

## Agregar un nuevo cliente

1. Copiar `config/chocolate_pasion.json` → `config/nuevo_cliente.json`
2. Editar: nombre, precios, instrucciones, prompt del negocio
3. Correr con `CLIENTE_ID=nuevo_cliente node index.js`
4. El cliente escanea el QR
5. Listo, corre para siempre

## Estructura de archivos

```
bot-whatsapp/
├── index.js              ← el bot (no tocar)
├── package.json
├── config/
│   ├── chocolate_pasion.json   ← config de tu negocio
│   └── cliente_X.json          ← config de cada nuevo cliente
└── sesiones/
    ├── chocolate_pasion/       ← sesión guardada (no tocar)
    └── cliente_X/              ← sesión de cada cliente
```

## Si el bot se desconecta

Se reconecta solo automáticamente en 5 segundos.
Solo necesita volver a escanear QR si el cliente cerró sesión manualmente en su celular.

## Variables de entorno necesarias

- `ANTHROPIC_API_KEY` — tu API key de Anthropic (obligatorio)
- `CLIENTE_ID` — qué cliente correr (default: chocolate_pasion)

## Para correr en servidor 24/7 (Railway/Render)

En Railway:
1. Subir esta carpeta a GitHub
2. Crear proyecto en railway.app
3. Agregar variables de entorno: ANTHROPIC_API_KEY y CLIENTE_ID
4. Deploy automático

El QR aparecerá en los logs de Railway la primera vez.
Escanear desde ahí, y la sesión queda guardada en el servidor.
