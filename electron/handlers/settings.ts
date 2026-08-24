/**
 * @author Virender Dhiman
 * @year 2025
 * @project Freebuff Agent
 * @license MIT
 */
/**
 * Settings & Providers IPC Handlers
 * Manages AI provider configs, API keys, workspace settings, and conversation persistence
 */
import { app, ipcMain, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'

/** Path to settings JSON on disk */
export const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

/** Default provider list — 44 providers across 6 categories */
const DEFAULT_PROVIDERS = [
  // ═══ FREE OFFICIAL ═══
  { id: 'groq', name: 'Groq ⚡', apiKey: '', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', freeTier: true, signupUrl: 'https://console.groq.com/keys', notes: 'Free: 30 req/min. Ultra-fast inference on custom LPU hardware.' },
  { id: 'cerebras', name: 'Cerebras 🧠', apiKey: '', baseUrl: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b', freeTier: true, signupUrl: 'https://cloud.cerebras.ai/', notes: 'Free: $5 credits. 20x faster inference than GPU.' },
  { id: 'sambanova', name: 'SambaNova 🟣', apiKey: '', baseUrl: 'https://api.sambanova.ai/v1', model: 'Meta-Llama-3.3-70B-Instruct', freeTier: true, signupUrl: 'https://cloud.sambanova.ai/apis', notes: 'Free tier: generous rate limits.' },
  { id: 'huggingface', name: 'Hugging Face 🤗', apiKey: '', baseUrl: 'https://api-inference.huggingface.co/v1', model: 'openai/gpt-oss-120b', freeTier: true, signupUrl: 'https://huggingface.co/settings/tokens', notes: 'Free tier: 1000+ models, OpenAI-compatible.' },
  { id: 'deepseek', name: 'DeepSeek 🔍', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', freeTier: true, signupUrl: 'https://platform.deepseek.com/api_keys', notes: 'Free tier available. Top-tier Chinese LLM.' },
  { id: 'gemini', name: 'Google Gemini ✨', apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', freeTier: true, signupUrl: 'https://aistudio.google.com/apikey', notes: 'Free: 15 req/min. Multimodal (text, image, video, audio).' },
  { id: 'github', name: 'GitHub Models 🐙', apiKey: '', baseUrl: 'https://models.inference.ai.azure.com', model: 'gpt-4o-mini', freeTier: true, signupUrl: 'https://github.com/settings/tokens', notes: 'Free: 15 req/min. GPT-4o-mini via GitHub.' },
  { id: 'openrouter', name: 'OpenRouter 🌐', apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', freeTier: true, signupUrl: 'https://openrouter.ai/keys', notes: 'Aggregator with many free models.' },
  { id: 'mistral', name: 'Mistral AI 🌊', apiKey: '', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', freeTier: true, signupUrl: 'https://console.mistral.ai/api-keys/', notes: 'Free tier. European AI leader. Excellent at code.' },
  { id: 'together', name: 'Together AI 🤝', apiKey: '', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3-70b-chat-hf', freeTier: true, signupUrl: 'https://api.together.xyz/settings/api-keys', notes: 'Free: $1 credits on signup. 200+ models.' },
  { id: 'fireworks', name: 'Fireworks AI 🔥', apiKey: '', baseUrl: 'https://api.fireworks.ai/inference/v1', model: 'accounts/fireworks/models/llama-v3p3-70b-instruct', freeTier: true, signupUrl: 'https://fireworks.ai/account/api-keys', notes: 'Free: $1 credits. Blazing fast.' },
  { id: 'deepinfra', name: 'DeepInfra 🌌', apiKey: '', baseUrl: 'https://api.deepinfra.com/v1/openai', model: 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo', freeTier: true, signupUrl: 'https://deepinfra.com/dash/api_keys', notes: 'Free: $1 credits. Serverless inference.' },
  { id: 'siliconflow', name: 'SiliconFlow 🇨🇳', apiKey: '', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct', freeTier: true, signupUrl: 'https://cloud.siliconflow.cn/account/ak', notes: 'Free tier. Qwen, DeepSeek. Very generous.' },
  { id: 'xiai', name: 'xAI (Grok) 🚀', apiKey: '', baseUrl: 'https://api.x.ai/v1', model: 'grok-2-1212', freeTier: true, signupUrl: 'https://console.x.ai/', notes: 'Free: $25 credits on signup.' },
  { id: 'novita', name: 'Novita AI 🎯', apiKey: '', baseUrl: 'https://api.novita.ai/v3/openai', model: 'meta-llama/llama-3.3-70b-instruct', freeTier: true, signupUrl: 'https://novita.ai/settings/api-keys', notes: 'Free tier. Fast inference.' },
  { id: 'mimo', name: 'Xiaomi MiMo 🔶', apiKey: '', baseUrl: 'https://api-inference.huggingface.co/v1', model: 'XiaomiMiMo/MiMo-V2-Flash', freeTier: true, signupUrl: 'https://huggingface.co/settings/tokens', notes: '310B reasoning model. Free via HuggingFace.' },

  // ═══ IMAGE / VIDEO ═══
  { id: 'flux', name: 'FLUX.2 (BFL) 🎨', apiKey: '', baseUrl: 'https://api.bfl.ml/v1', model: 'flux-2-klein', freeTier: true, signupUrl: 'https://bfl.ai/', notes: 'Black Forest Labs FLUX.2.' },
  { id: 'pollinations_img', name: 'Pollinations Image 🖼️', apiKey: '', baseUrl: 'https://image.pollinations.ai', model: 'flux', freeTier: true, signupUrl: 'https://pollinations.ai/', notes: 'Free image generation via URL. No key needed.' },
  { id: 'runway', name: 'Runway 🎬', apiKey: '', baseUrl: 'https://api.runwayml.com/v1', model: 'gen3-alpha', freeTier: true, signupUrl: 'https://runwayml.com/', notes: 'Premium video generation. Free tier.' },
  { id: 'kling', name: 'Kling Video 🎥', apiKey: '', baseUrl: 'https://api.klingai.com/v1', model: 'kling-v1', freeTier: true, signupUrl: 'https://klingai.com/', notes: 'Text/image-to-video. Free credits.' },
  { id: 'replicate', name: 'Replicate 🔄', apiKey: '', baseUrl: 'https://api.replicate.com/v1', model: 'black-forest-labs/flux-schnell', freeTier: true, signupUrl: 'https://replicate.com/account/api-tokens', notes: '300K+ models. FLUX Schnell is free.' },
  { id: 'stability', name: 'Stability AI 🖼️', apiKey: '', baseUrl: 'https://api.stability.ai/v2beta', model: 'stable-diffusion-xl-1024-v1-0', freeTier: true, signupUrl: 'https://platform.stability.ai/account/keys', notes: 'Free credits. SDXL, SD3.' },

  // ═══ LOCAL ═══
  { id: 'ollama', name: 'Ollama (Local) 🏠', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.3', freeTier: true, signupUrl: 'https://ollama.com/download', notes: '100% free & private. 100+ models.' },
  { id: 'lmstudio', name: 'LM Studio (Local) 💻', apiKey: 'lm-studio', baseUrl: 'http://localhost:1234/v1', model: 'local-model', freeTier: true, signupUrl: 'https://lmstudio.ai/', notes: '100% free & private. Beautiful GUI.' },
  { id: 'llamacpp', name: 'llama.cpp Server 📦', apiKey: 'llama-cpp', baseUrl: 'http://localhost:8080/v1', model: 'local', freeTier: true, signupUrl: 'https://github.com/ggml-org/llama.cpp', notes: '100% free. Maximum performance.' },

  // ═══ COMMUNITY ═══
  { id: 'g4f', name: 'gpt4free (g4f) 🏴\u200d☠️', apiKey: '', baseUrl: 'http://localhost:8080/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://github.com/xtekky/gpt4free', notes: '12K+ GitHub stars. GPT-4, Claude, Gemini free.' },
  { id: 'pollinations', name: 'Pollinations 🌻', apiKey: '', baseUrl: 'https://text.pollinations.ai/openai', model: 'openai', freeTier: true, signupUrl: 'https://github.com/pollinations/pollinations', notes: 'Open-source. Free text, image, video, audio.' },
  { id: 'chatgpt2api', name: 'ChatGPT-to-API 🔄', apiKey: '', baseUrl: 'http://localhost:8080/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://github.com/acheong08/ChatGPT-to-API', notes: 'Convert ChatGPT website to API.' },
  { id: 'zukijourney', name: 'Zukijourney 🌐', apiKey: '', baseUrl: 'https://api.zukijourney.com/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/zukijourney', notes: '8,058 users. GPT-4.1, Claude-3.5, Gemini-2.5.' },
  { id: 'electronhub', name: 'ElectronHub ⚡', apiKey: '', baseUrl: 'https://api.electronhub.org/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/electronhub', notes: '5,898 users. GPT-4.1, Claude-3.5, Gemini.' },
  { id: 'voidai', name: 'VoidAI 👻', apiKey: '', baseUrl: 'https://api.voidai.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/voidai', notes: '2,089 users. GPT-4.1, Claude-3.5, DeepSeek-R1.' },
  { id: 'nagaai', name: 'NagaAI 🐉', apiKey: '', baseUrl: 'https://api.nagaapi.com/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/nagaai', notes: '3,582 users. Claude-3.5 free tier.' },
  { id: 'helixmind', name: 'HelixMind 🔮', apiKey: '', baseUrl: 'https://api.helixmind.dev/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/helixmind', notes: '2,651 users. TTS, STT, embeddings.' },
  { id: 'navyapi', name: 'NavyAPI 🚢', apiKey: '', baseUrl: 'https://api.navyai.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/navyai', notes: '1,543 users. GPT-4.1, Gemini, image gen.' },
  { id: 'mnn', name: 'MNN API 🧊', apiKey: '', baseUrl: 'https://api.mnapi.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/mnn', notes: '479 users. GPT-4.1, Gemini, DeepSeek, Flux.' },
  { id: 'webraftai', name: 'WebraftAI 🕸️', apiKey: '', baseUrl: 'https://api.webraft.ai/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/webraftai', notes: '1,506 users. Improving.' },
  { id: 'voltai', name: 'VoltAI ⚡', apiKey: '', baseUrl: 'https://api.voltai.top/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/voltai', notes: '249 users. DeepSeek-R1, image gen.' },
  { id: 'hcap', name: 'hcap.ai 🧢', apiKey: '', baseUrl: 'https://api.hcap.ai/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/hcap', notes: '219 users. GPT-4.1, DeepSeek-R1.' },
  { id: 'zanityai', name: 'ZanityAI 😈', apiKey: '', baseUrl: 'https://api.zanity.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/zanityai', notes: '1,699 users. GPT-4.1, Claude-3.5.' },
  { id: 'kimetsu', name: 'Kimetsu 🔥', apiKey: '', baseUrl: 'https://api.kimetsu.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/kimetsu', notes: '2,014 users. Claude-3.5, DeepSeek-R1.' },

  // ═══ PAID ═══
  { id: 'openai', name: 'OpenAI 💰', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', notes: 'Industry standard. GPT-4o, o1, o3.' },
  { id: 'anthropic', name: 'Anthropic 💰', apiKey: '', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', notes: 'Claude models. Best at long context.' },
  { id: 'cohere', name: 'Cohere 💰', apiKey: '', baseUrl: 'https://api.cohere.com/v2', model: 'command-a-03-2025', notes: 'Enterprise RAG leader. Command models.' },
  { id: 'perplexity', name: 'Perplexity 💰', apiKey: '', baseUrl: 'https://api.perplexity.ai', model: 'sonar-pro', notes: 'Search-augmented LLM. $5 free credits.' },
]

/** Encrypt an API key using Electron's safeStorage (OS keychain) */
function encryptApiKey(key: string): string {
  if (!key || !safeStorage.isEncryptionAvailable()) return key
  try {
    const encrypted = safeStorage.encryptString(key)
    return `enc:${encrypted.toString('base64')}`
  } catch { return key }
}

/** Decrypt an API key that was encrypted with safeStorage */
function decryptApiKey(key: string): string {
  if (!key || !key.startsWith('enc:')) return key
  try {
    const buf = Buffer.from(key.slice(4), 'base64')
    return safeStorage.decryptString(buf)
  } catch { return key }
}

export function registerSettingsHandlers() {
  ipcMain.handle('settings:load', async () => {
    try {
      const data = await fs.promises.readFile(SETTINGS_PATH, 'utf-8')
      const parsed = JSON.parse(data)
      // Decrypt API keys on load
      if (parsed.providers) {
        parsed.providers = parsed.providers.map((p: any) => ({
          ...p,
          apiKey: decryptApiKey(p.apiKey),
        }))
      }
      return parsed
    } catch {
      return {
        providers: DEFAULT_PROVIDERS,
        activeProvider: 'groq',
        workspacePath: '',
      }
    }
  })

  ipcMain.handle('settings:save', async (_event, settings: any) => {
    try {
      // Encrypt API keys before saving to disk
      const toSave = {
        ...settings,
        providers: settings.providers?.map((p: any) => ({
          ...p,
          apiKey: encryptApiKey(p.apiKey),
        })) || settings.providers,
      }
      await fs.promises.writeFile(SETTINGS_PATH, JSON.stringify(toSave, null, 2), 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  // Conversation persistence
  ipcMain.handle('conversations:save', async (_event, data: { messages: any[]; taskId: string }) => {
    try {
      const convPath = path.join(app.getPath('userData'), 'conversations')
      await fs.promises.mkdir(convPath, { recursive: true })
      const filename = path.join(convPath, `${Date.now()}.json`)
      await fs.promises.writeFile(filename, JSON.stringify(data, null, 2), 'utf-8')
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })

  ipcMain.handle('conversations:load', async () => {
    try {
      const convPath = path.join(app.getPath('userData'), 'conversations')
      const files = await fs.promises.readdir(convPath).catch(() => [])
      const jsonFiles = files.filter(f => f.endsWith('.json')).sort().reverse().slice(0, 50)
      const conversations = []
      for (const f of jsonFiles) {
        try {
          const data = JSON.parse(await fs.promises.readFile(path.join(convPath, f), 'utf-8'))
          conversations.push({ ...data, id: f.replace('.json', '') })
        } catch {}
      }
      return conversations
    } catch (err: any) {
      return { error: err.message }
    }
  })
}
