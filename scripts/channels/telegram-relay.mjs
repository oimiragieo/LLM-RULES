/* global fetch */
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import fs from 'fs'
import path from 'path'
import os from 'os'

// 1. Load Telegram configuration
const envPath = path.join(os.homedir(), '.claude', 'channels', 'telegram', '.env')
let token = process.env.TELEGRAM_BOT_TOKEN || ''
if (!token && fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  const match = envFile.match(/TELEGRAM_BOT_TOKEN=(.+)/)
  if (match) token = match[1].trim()
}

const accessPath = path.join(os.homedir(), '.claude', 'channels', 'telegram', 'access.json')
let allowed = new Set()
if (fs.existsSync(accessPath)) {
  const accessData = JSON.parse(fs.readFileSync(accessPath, 'utf8'))
  allowed = new Set(accessData.allowFrom || [])
}

if (!token) {
  console.error("No TELEGRAM_BOT_TOKEN found in " + envPath)
  process.exit(1)
}

// Helper to send messages back to the chat
async function sendTelegramMessage(chatId, text) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text })
  })
  if (!res.ok) {
    console.error("Failed to send telegram message:", await res.text())
  }
}

// 2. Initialize MCP Server
const mcp = new Server(
  { name: 'telegram-relay', version: '1.0.0' },
  {
    capabilities: {
      experimental: {
        'claude/channel': {},
        'claude/channel/permission': {}, // Opt-in to Permission Relay
      },
      tools: {},
    },
    instructions:
      'Messages arrive as <channel source="telegram" chat_id="..." attachment_file_id="...">. ' +
      'Reply with the reply tool, passing the chat_id from the tag.',
  }
)

// 3. Register Reply Tool
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'reply',
      description: 'Send a message back over this Telegram channel',
      inputSchema: {
        type: 'object',
        properties: {
          chat_id: { type: 'string', description: 'The conversation to reply in' },
          text: { type: 'string', description: 'The message to send' },
        },
        required: ['chat_id', 'text'],
      },
    },
    {
      name: 'download_attachment',
      description: 'Download a telegram file attachment by file_id to the local inbox directory',
      inputSchema: {
        type: 'object',
        properties: {
          file_id: { type: 'string', description: 'The file_id received in the attachment_file_id metadata or message' },
        },
        required: ['file_id'],
      },
    }
  ],
}))

mcp.setRequestHandler(CallToolRequestSchema, async req => {
  if (req.params.name === 'reply') {
    const { chat_id, text } = req.params.arguments
    await sendTelegramMessage(chat_id, text)
    return { content: [{ type: 'text', text: 'sent' }] }
  } else if (req.params.name === 'download_attachment') {
    const { file_id } = req.params.arguments
    
    try {
      // Get file path
      const pathRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${file_id}`)
      if (!pathRes.ok) throw new Error("Failed to get file path from Telegram API")
      const pathData = await pathRes.json()
      if (!pathData.ok) throw new Error(pathData.description || "Telegram API rejected file path request")
      
      const file_path = pathData.result.file_path
      const ext = path.extname(file_path) || '.oga'
      
      // Download the actual file
      const downloadRes = await fetch(`https://api.telegram.org/file/bot${token}/${file_path}`)
      if (!downloadRes.ok) throw new Error("Failed to download file from Telegram")
      
      const buffer = Buffer.from(await downloadRes.arrayBuffer())
      
      const inboxDir = path.join(os.homedir(), '.claude', 'channels', 'telegram', 'inbox')
      if (!fs.existsSync(inboxDir)) {
        fs.mkdirSync(inboxDir, { recursive: true })
      }
      
      const destPath = path.join(inboxDir, `${Date.now()}-${file_id.slice(0, 15)}${ext}`)
      fs.writeFileSync(destPath, buffer)
      
      return { content: [{ type: 'text', text: destPath }] }
    } catch (e) {
      return { content: [{ type: 'text', text: `Error downloading attachment: ${e.message}` }] }
    }
  }
  throw new Error(`unknown tool: ${req.params.name}`)
})

// 4. Handle Permission Request Relay
const PermissionRequestSchema = z.object({
  method: z.literal('notifications/claude/channel/permission_request'),
  params: z.object({
    request_id: z.string(),
    tool_name: z.string(),
    description: z.string(),
    input_preview: z.string().optional().default(''),
  }),
})

mcp.setNotificationHandler(PermissionRequestSchema, async ({ params }) => {
  const prompt = `⚠️ Claude wants to run *${params.tool_name}*:\n${params.description}\n` +
                 (params.input_preview ? `\n\`\`\`\n${params.input_preview}\n\`\`\`\n\n` : `\n`) +
                 `Reply "yes ${params.request_id}" or "no ${params.request_id}"`
                 
  // Broadcast the prompt to all configured authorized users
  for (const chatId of allowed) {
    await sendTelegramMessage(chatId, prompt)
  }
})

// Start processing MCP messages on standard I/O streams
await mcp.connect(new StdioServerTransport())

// 5. Telegram Polling Loop
let lastUpdateId = 0
const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i

async function pollTelegram() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${lastUpdateId}&timeout=30`)
    if (!res.ok) return
    const data = await res.json()
    if (!data.ok) return
    
    for (const update of data.result) {
      lastUpdateId = update.update_id + 1
      if (!update.message) continue
      
      const senderId = String(update.message.from?.id)
      if (!allowed.has(senderId)) continue
      
      let text = update.message.text || ''
      let attachment_file_id = null
      
      if (update.message.voice) {
        attachment_file_id = update.message.voice.file_id
        if (!text) text = "/telegram-voice-pipeline"
      } else if (update.message.audio) {
        attachment_file_id = update.message.audio.file_id
        if (!text) text = "/telegram-voice-pipeline"
      }
      
      if (!text && !attachment_file_id) continue

      const chatId = String(update.message.chat?.id)
      
      // Check if this is a permission verdict
      const m = PERMISSION_REPLY_RE.exec(text)
      if (m && m[1]) {
        const behavior = (m[1].toLowerCase().startsWith('y')) ? 'allow' : 'deny'
        await mcp.notification({
          method: 'notifications/claude/channel/permission',
          params: {
            request_id: m[2].toLowerCase(),
            behavior: behavior,
          },
        })
        await sendTelegramMessage(chatId, `✅ Verdict recorded: ${behavior}`)
        continue
      }
      
      // Otherwise, forward as normal chat (auto-routing to channel-responder if no @ is present, and keeping / commands intact)
      const routedText = (text.includes('@') || text.startsWith('/')) ? text : `@channel-responder ${text}`
      
      const meta = { chat_id: chatId }
      if (attachment_file_id) {
        meta.attachment_file_id = attachment_file_id
      }
      
      await mcp.notification({
        method: 'notifications/claude/channel',
        params: { content: routedText, meta: meta },
      })
    }
  } catch (_e) {
    // Suppress network errors to keep the polling loop alive
  } finally {
    setTimeout(pollTelegram, 2000)
  }
}

// Begin polling
pollTelegram()
