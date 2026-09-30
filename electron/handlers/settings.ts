/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license MIT
 */
/**
 * Settings & Providers IPC Handlers
 * Manages AI provider configs, encrypted API keys, and workspace settings.
 */
import { app, ipcMain, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'

/** Path to settings JSON on disk */
export const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

/** Default provider catalog. Free-tier terms change often; notes stay deliberately generic. */
const DEFAULT_PROVIDERS = [
  // ═══ FREE OFFICIAL ═══
  { id: 'groq', name: 'Groq ⚡', apiKey: '', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', freeTier: true, signupUrl: 'https://console.groq.com/keys', notes: 'Free tier with per-minute rate limits. Very low latency.' },
  { id: 'cerebras', name: 'Cerebras 🧠', apiKey: '', baseUrl: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b', freeTier: true, signupUrl: 'https://cloud.cerebras.ai/', notes: 'Free tier with rate limits. Fast inference.' },
  { id: 'sambanova', name: 'SambaNova 🟣', apiKey: '', baseUrl: 'https://api.sambanova.ai/v1', model: 'Meta-Llama-3.3-70B-Instruct', freeTier: true, signupUrl: 'https://cloud.sambanova.ai/apis', notes: 'Free tier with rate limits.' },
  { id: 'huggingface', name: 'Hugging Face 🤗', apiKey: '', baseUrl: 'https://router.huggingface.co/v1', model: 'openai/gpt-oss-120b', freeTier: true, signupUrl: 'https://huggingface.co/settings/tokens', notes: 'OpenAI-compatible router with monthly free credits.' },
  { id: 'deepseek', name: 'DeepSeek 🔍', apiKey: '', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', freeTier: true, signupUrl: 'https://platform.deepseek.com/api_keys', notes: 'Low-cost API; promotional credits vary.' },
  { id: 'gemini', name: 'Google Gemini ✨', apiKey: '', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.0-flash', freeTier: true, signupUrl: 'https://aistudio.google.com/apikey', notes: 'Free tier with per-model rate limits. Multimodal.' },
  { id: 'github', name: 'GitHub Models 🐙', apiKey: '', baseUrl: 'https://models.inference.ai.azure.com', model: 'gpt-4o-mini', freeTier: true, signupUrl: 'https://github.com/settings/tokens', notes: 'Free, rate-limited access with a GitHub token.' },
  { id: 'openrouter', name: 'OpenRouter 🌐', apiKey: '', baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', freeTier: true, signupUrl: 'https://openrouter.ai/keys', notes: 'Aggregator. With a free key VD only picks ":free" models.' },
  { id: 'mistral', name: 'Mistral AI 🌊', apiKey: '', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', freeTier: true, signupUrl: 'https://console.mistral.ai/api-keys/', notes: 'Free experiment tier with rate limits.' },
  { id: 'together', name: 'Together AI 🤝', apiKey: '', baseUrl: 'https://api.together.xyz/v1', model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', freeTier: true, signupUrl: 'https://api.together.xyz/settings/api-keys', notes: 'Signup credits may be available.' },
  { id: 'fireworks', name: 'Fireworks AI 🔥', apiKey: '', baseUrl: 'https://api.fireworks.ai/inference/v1', model: 'accounts/fireworks/models/llama-v3p3-70b-instruct', freeTier: true, signupUrl: 'https://fireworks.ai/account/api-keys', notes: 'Signup credits may be available.' },
  { id: 'deepinfra', name: 'DeepInfra 🌌', apiKey: '', baseUrl: 'https://api.deepinfra.com/v1/openai', model: 'meta-llama/Meta-Llama-3.3-70B-Instruct-Turbo', freeTier: true, signupUrl: 'https://deepinfra.com/dash/api_keys', notes: 'Signup credits may be available.' },
  { id: 'siliconflow', name: 'SiliconFlow 🇨🇳', apiKey: '', baseUrl: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct', freeTier: true, signupUrl: 'https://cloud.siliconflow.cn/account/ak', notes: 'Some models are free. Qwen and DeepSeek families.' },
  { id: 'xiai', name: 'xAI (Grok) 🚀', apiKey: '', baseUrl: 'https://api.x.ai/v1', model: 'grok-2-1212', freeTier: true, signupUrl: 'https://console.x.ai/', notes: 'Signup credits may be available.' },
  { id: 'novita', name: 'Novita AI 🎯', apiKey: '', baseUrl: 'https://api.novita.ai/v3/openai', model: 'meta-llama/llama-3.3-70b-instruct', freeTier: true, signupUrl: 'https://novita.ai/settings/api-keys', notes: 'Signup credits may be available.' },
  { id: 'mimo', name: 'Xiaomi MiMo 🔶', apiKey: '', baseUrl: 'https://router.huggingface.co/v1', model: 'XiaomiMiMo/MiMo-V2-Flash', freeTier: true, signupUrl: 'https://huggingface.co/settings/tokens', notes: 'Served through the Hugging Face router; uses a Hugging Face token.' },

  // ═══ IMAGE / VIDEO (not used for chat) ═══
  { id: 'flux', name: 'FLUX.2 (BFL) 🎨', apiKey: '', baseUrl: 'https://api.bfl.ml/v1', model: 'flux-2-klein', freeTier: true, signupUrl: 'https://bfl.ai/', notes: 'Image generation. Not a chat provider.' },
  { id: 'pollinations_img', name: 'Pollinations Image 🖼️', apiKey: '', baseUrl: 'https://image.pollinations.ai', model: 'flux', freeTier: true, signupUrl: 'https://pollinations.ai/', notes: 'Image generation via URL. No key needed.' },
  { id: 'runway', name: 'Runway 🎬', apiKey: '', baseUrl: 'https://api.runwayml.com/v1', model: 'gen3-alpha', freeTier: true, signupUrl: 'https://runwayml.com/', notes: 'Video generation. Limited free credits.' },
  { id: 'kling', name: 'Kling Video 🎥', apiKey: '', baseUrl: 'https://api.klingai.com/v1', model: 'kling-v1', freeTier: true, signupUrl: 'https://klingai.com/', notes: 'Text/image-to-video. Limited free credits.' },
  { id: 'replicate', name: 'Replicate 🔄', apiKey: '', baseUrl: 'https://api.replicate.com/v1', model: 'black-forest-labs/flux-schnell', freeTier: true, signupUrl: 'https://replicate.com/account/api-tokens', notes: 'Hosted open models. Pay-per-use after any trial.' },
  { id: 'stability', name: 'Stability AI 🖼️', apiKey: '', baseUrl: 'https://api.stability.ai/v2beta', model: 'stable-diffusion-xl-1024-v1-0', freeTier: true, signupUrl: 'https://platform.stability.ai/account/keys', notes: 'Image generation. Signup credits.' },

  // ═══ LOCAL ═══
  { id: 'ollama', name: 'Ollama (Local) 🏠', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'llama3.3', freeTier: true, signupUrl: 'https://ollama.com/download', notes: 'Runs on your machine. Prompts never leave it.' },
  { id: 'lmstudio', name: 'LM Studio (Local) 💻', apiKey: 'lm-studio', baseUrl: 'http://localhost:1234/v1', model: 'local-model', freeTier: true, signupUrl: 'https://lmstudio.ai/', notes: 'Runs on your machine. Desktop GUI for local models.' },
  { id: 'llamacpp', name: 'llama.cpp Server 📦', apiKey: 'llama-cpp', baseUrl: 'http://localhost:8080/v1', model: 'local', freeTier: true, signupUrl: 'https://github.com/ggml-org/llama.cpp', notes: 'Runs on your machine. Lightweight OpenAI-compatible server.' },

  // ═══ COMMUNITY (third-party proxies — never used as automatic fallbacks) ═══
  { id: 'g4f', name: 'gpt4free (g4f) 🏴\u200d☠️', apiKey: '', baseUrl: 'http://localhost:8080/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://github.com/xtekky/gpt4free', notes: 'Self-hosted proxy. Unofficial; reliability varies.' },
  { id: 'pollinations', name: 'Pollinations 🌻', apiKey: '', baseUrl: 'https://text.pollinations.ai/openai', model: 'openai', freeTier: true, signupUrl: 'https://github.com/pollinations/pollinations', notes: 'Open-source community API. Rate-limited.' },
  { id: 'chatgpt2api', name: 'ChatGPT-to-API 🔄', apiKey: '', baseUrl: 'http://localhost:8080/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://github.com/acheong08/ChatGPT-to-API', notes: 'Self-hosted proxy. Unofficial.' },
  { id: 'zukijourney', name: 'Zukijourney 🌐', apiKey: '', baseUrl: 'https://api.zukijourney.com/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/zukijourney', notes: 'Third-party proxy. Sees your prompts.' },
  { id: 'electronhub', name: 'ElectronHub ⚡', apiKey: '', baseUrl: 'https://api.electronhub.org/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/electronhub', notes: 'Third-party proxy. Sees your prompts.' },
  { id: 'voidai', name: 'VoidAI 👻', apiKey: '', baseUrl: 'https://api.voidai.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/voidai', notes: 'Third-party proxy. Sees your prompts.' },
  { id: 'nagaai', name: 'NagaAI 🐉', apiKey: '', baseUrl: 'https://api.nagaapi.com/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/nagaai', notes: 'Third-party proxy. Sees your prompts.' },
  { id: 'helixmind', name: 'HelixMind 🔮', apiKey: '', baseUrl: 'https://api.helixmind.dev/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/helixmind', notes: 'Third-party proxy. Sees your prompts.' },
  { id: 'navyapi', name: 'NavyAPI 🚢', apiKey: '', baseUrl: 'https://api.navyai.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/navyai', notes: 'Third-party proxy. Sees your prompts.' },
  { id: 'mnn', name: 'MNN API 🧊', apiKey: '', baseUrl: 'https://api.mnapi.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/mnn', notes: 'Third-party proxy. Sees your prompts.' },
  { id: 'webraftai', name: 'WebraftAI 🕸️', apiKey: '', baseUrl: 'https://api.webraft.ai/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/webraftai', notes: 'Third-party proxy. Sees your prompts.' },
  { id: 'voltai', name: 'VoltAI ⚡', apiKey: '', baseUrl: 'https://api.voltai.top/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/voltai', notes: 'Third-party proxy. Sees your prompts.' },
  { id: 'hcap', name: 'hcap.ai 🧢', apiKey: '', baseUrl: 'https://api.hcap.ai/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/hcap', notes: 'Third-party proxy. Sees your prompts.' },
  { id: 'zanityai', name: 'ZanityAI 😈', apiKey: '', baseUrl: 'https://api.zanity.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/zanityai', notes: 'Third-party proxy. Sees your prompts.' },
  { id: 'kimetsu', name: 'Kimetsu 🔥', apiKey: '', baseUrl: 'https://api.kimetsu.xyz/v1', model: 'gpt-4o', freeTier: true, signupUrl: 'https://discord.gg/kimetsu', notes: 'Third-party proxy. Sees your prompts.' },

  // ═══ PAID ═══
  { id: 'openai', name: 'OpenAI 💰', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', notes: 'Paid API.' },
  { id: 'anthropic', name: 'Anthropic 💰', apiKey: '', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', notes: 'Paid API. Uses the Messages API; no automatic model discovery.' },
  { id: 'cohere', name: 'Cohere 💰', apiKey: '', baseUrl: 'https://api.cohere.ai/compatibility/v1', model: 'command-a-03-2025', notes: 'Paid API with a trial key tier.' },
  { id: 'perplexity', name: 'Perplexity 💰', apiKey: '', baseUrl: 'https://api.perplexity.ai', model: 'sonar-pro', notes: 'Paid, search-augmented API.' },
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

/** Add providers introduced after the user's settings file was first written. */
function withNewDefaults(providers: any[]): any[] {
  const known = new Set(providers.map((p) => p.id))
  return [...providers, ...DEFAULT_PROVIDERS.filter((p) => !known.has(p.id))]
}

/** Decrypted keys that look real (placeholders like "ollama" are ignored). Used to redact chat history. */
export async function loadConfiguredApiKeys(): Promise<string[]> {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(SETTINGS_PATH, 'utf-8'))
    return (parsed.providers || [])
      .map((p: any) => decryptApiKey(p.apiKey || ''))
      .filter((k: string) => typeof k === 'string' && k.length >= 12 && !k.startsWith('enc:'))
  } catch {
    return []
  }
}

export function registerSettingsHandlers() {
  ipcMain.handle('settings:load', async () => {
    try {
      const data = await fs.promises.readFile(SETTINGS_PATH, 'utf-8')
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed.providers)) {
        parsed.providers = withNewDefaults(
          parsed.providers.map((p: any) => ({ ...p, apiKey: decryptApiKey(p.apiKey) }))
        )
      } else {
        parsed.providers = DEFAULT_PROVIDERS
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
}
