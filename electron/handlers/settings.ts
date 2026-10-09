/**
 * @author Virender Dhiman
 * @year 2025
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Settings & Providers IPC Handlers
 * Manages AI provider configs, encrypted API keys, and workspace settings.
 */
import { app, ipcMain, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'
import { randomUUID } from 'crypto'
import { privateEnvCandidatePaths } from '../privateEnv'
import { maskProviderForRenderer, nextStoredApiKey } from '../../src/lib/providerKeys'
import { COMMUNITY_PROVIDER_IDS, omitCommunityProviders, omitRetiredProviders } from '../../src/lib/providers'

/** Path to settings JSON on disk */
export const SETTINGS_PATH = path.join(app.getPath('userData'), 'settings.json')

const ENV_PROVIDER_KEYS: Record<string, string[]> = {
  groq: ['GROQ_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  mistral: ['MISTRAL_API_KEY'],
  nvidia: ['NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY'],
  llm7: ['LLM7_API_KEY'],
  custom_openai: ['VD_AGENT_CUSTOM_API_KEY', 'CUSTOM_OPENAI_API_KEY'],
  ollama: ['OLLAMA_API_KEY_OR_URL'],
}

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
  { id: 'mistral', name: 'Mistral AI 🌊', apiKey: '', baseUrl: 'https://api.mistral.ai/v1', model: 'mistral-large-latest', freeTier: true, signupUrl: 'https://console.mistral.ai/api-keys/', notes: 'Official OpenAI-compatible chat API. Free experiment tier or credits may be rate-limited.' },
  { id: 'nvidia', name: 'NVIDIA NIM ⚡', apiKey: '', baseUrl: 'https://integrate.api.nvidia.com/v1', model: 'qwen/qwen2.5-coder-32b-instruct', freeTier: true, signupUrl: 'https://build.nvidia.com/', notes: 'OpenAI-compatible NVIDIA-hosted NIM API. Free/hosted access and available models can change.' },
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
  { id: 'replicate', name: 'Replicate 🔄', apiKey: '', baseUrl: 'https://api.replicate.com/v1', model: 'black-forest-labs/flux-schnell', freeTier: true, signupUrl: 'https://replicate.com/account/api-tokens', notes: 'Hosted open models. Pay-per-use after any trial.' },
  { id: 'stability', name: 'Stability AI 🖼️', apiKey: '', baseUrl: 'https://api.stability.ai/v2beta', model: 'stable-diffusion-xl-1024-v1-0', freeTier: true, signupUrl: 'https://platform.stability.ai/account/keys', notes: 'Image generation. Signup credits.' },

  // ═══ LOCAL ═══
  { id: 'ollama', name: 'Ollama (Local) 🏠', apiKey: 'ollama', baseUrl: 'http://localhost:11434/v1', model: 'qwen2.5-coder:7b', freeTier: true, signupUrl: 'https://ollama.com/download', notes: 'Runs on your machine. Prompts never leave it.' },
  { id: 'lmstudio', name: 'LM Studio (Local) 💻', apiKey: 'lm-studio', baseUrl: 'http://localhost:1234/v1', model: 'local-model', freeTier: true, signupUrl: 'https://lmstudio.ai/', notes: 'Runs on your machine. Desktop GUI for local models.' },
  { id: 'llamacpp', name: 'llama.cpp Server 📦', apiKey: 'llama-cpp', baseUrl: 'http://localhost:8080/v1', model: 'local', freeTier: true, signupUrl: 'https://github.com/ggml-org/llama.cpp', notes: 'Runs on your machine. Point the base URL at any OpenAI-compatible local server.' },

  // ═══ PAID ═══
  { id: 'openai', name: 'OpenAI 💰', apiKey: '', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o', notes: 'Paid API.' },
  { id: 'anthropic', name: 'Anthropic 💰', apiKey: '', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-20250514', notes: 'Paid API. Uses the Messages API; no automatic model discovery.' },
  { id: 'cohere', name: 'Cohere 💰', apiKey: '', baseUrl: 'https://api.cohere.ai/compatibility/v1', model: 'command-a-03-2025', notes: 'Paid API with a trial key tier.' },
  { id: 'llm7', name: 'LLM7 💰', apiKey: '', baseUrl: 'https://api.llm7.io/v1', model: 'DeepSeek-V4-Flash-0731', signupUrl: 'https://llm7.io/', notes: 'OpenAI-compatible provider with published per-token pricing. Not used as automatic free fallback.' },
  { id: 'perplexity', name: 'Perplexity 💰', apiKey: '', baseUrl: 'https://api.perplexity.ai', model: 'sonar-pro', notes: 'Paid, search-augmented API.' },
  { id: 'custom_openai', name: 'Custom OpenAI-Compatible 🔌', apiKey: '', baseUrl: '', model: 'auto', notes: 'Connect any future OpenAI-compatible API. Set the base URL, key, and model, then use Refresh Live Models when the provider supports /models.' },
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

function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
    }
    out[match[1]] = value
  }
  return out
}

function loadPrivateEnv(): Record<string, string> {
  const candidates = privateEnvCandidatePaths({
    userData: app.getPath('userData'),
    appPath: app.getAppPath(),
    packaged: app.isPackaged,
    envFile: process.env.VD_AGENT_ENV_FILE,
    disabled: process.env.VD_AGENT_DISABLE_ENV_IMPORT === '1',
  })
  const merged: Record<string, string> = {}
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      Object.assign(merged, parseDotEnv(fs.readFileSync(file, 'utf-8')))
    } catch {}
  }
  return merged
}

function withEnvProviderKeys(providers: any[]): any[] {
  const env = loadPrivateEnv()
  if (Object.keys(env).length === 0) return providers
  return providers.map((provider) => {
    if (provider.apiKey) return provider
    const keys = ENV_PROVIDER_KEYS[provider.id] || []
    const apiKey = keys.map((key) => env[key]).find((value) => typeof value === 'string' && value.trim())
    return apiKey ? { ...provider, apiKey } : provider
  })
}

/** Add providers introduced after the user's settings file was first written. */
function withNewDefaults(providers: any[]): any[] {
  const kept = omitRetiredProviders(omitCommunityProviders(providers))
  const known = new Set(kept.map((p) => p.id))
  return [...kept, ...DEFAULT_PROVIDERS.filter((p) => !known.has(p.id))]
}

function normalizeActiveProvider(activeProvider: string | undefined, providers: { id: string }[]): string {
  if (activeProvider && !COMMUNITY_PROVIDER_IDS.includes(activeProvider) && providers.some((p) => p.id === activeProvider)) {
    return activeProvider
  }
  return providers.some((p) => p.id === 'groq') ? 'groq' : (providers[0]?.id || 'groq')
}

/** Settings with decrypted keys, for the main process only. */
export async function loadRuntimeSettings(): Promise<any> {
  try {
    const parsed = JSON.parse(await fs.promises.readFile(SETTINGS_PATH, 'utf-8'))
    if (Array.isArray(parsed.providers)) {
      parsed.providers = withEnvProviderKeys(withNewDefaults(
        parsed.providers.map((p: any) => ({ ...p, apiKey: decryptApiKey(p.apiKey || '') }))
      ))
    } else {
      parsed.providers = withEnvProviderKeys(DEFAULT_PROVIDERS)
    }
    parsed.permissionMode ??= 'ask-risky'
    parsed.autoUpdate ??= false
    parsed.teamMode ??= 'auto'
    parsed.teamPreset ??= 'default'
    parsed.teamTokenBudget ??= 'balanced'
    parsed.dynamicTeam ??= true
    if (!parsed.teamProfile || typeof parsed.teamProfile !== 'object') parsed.teamProfile = {}
    parsed.activeProvider = normalizeActiveProvider(parsed.activeProvider, parsed.providers)
    return parsed
  } catch {
    return {
      providers: withEnvProviderKeys(DEFAULT_PROVIDERS),
      activeProvider: 'groq',
      workspacePath: '',
      permissionMode: 'ask-risky',
      autoUpdate: false,
      teamMode: 'auto',
      teamPreset: 'default',
      teamTokenBudget: 'balanced',
      dynamicTeam: true,
      teamProfile: {},
    }
  }
}

/** Use a key the user just typed. Otherwise read the saved key in the main process. */
export async function resolveProviderApiKey(providerId: string, supplied?: string): Promise<string> {
  const typed = typeof supplied === 'string' ? supplied.trim() : ''
  if (typed) return typed
  const settings = await loadRuntimeSettings()
  const provider = (settings.providers || []).find((item: any) => item.id === providerId)
  return typeof provider?.apiKey === 'string' ? provider.apiKey : ''
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
    const parsed = await loadRuntimeSettings()
    parsed.providers = (parsed.providers || []).map((provider: any) => maskProviderForRenderer(provider))
    return parsed
  })

  ipcMain.handle('settings:save', async (_event, settings: any) => {
    try {
      let previous: any[] = []
      try {
        const raw = JSON.parse(await fs.promises.readFile(SETTINGS_PATH, 'utf-8'))
        previous = Array.isArray(raw.providers) ? raw.providers : []
      } catch { /* first save */ }
      const previousKeys = new Map(previous.map((provider) => [provider.id, provider.apiKey || '']))
      const toSave = {
        ...settings,
        providers: settings.providers?.map((provider: any) => {
          const { hasKey: _hasKey, clearKey: _clearKey, ...rest } = provider
          return {
            ...rest,
            apiKey: nextStoredApiKey(provider, previousKeys.get(provider.id), encryptApiKey),
          }
        }) || settings.providers,
      }
      const tmp = `${SETTINGS_PATH}.${process.pid}.${randomUUID()}.tmp`
      await fs.promises.writeFile(tmp, JSON.stringify(toSave, null, 2), 'utf-8')
      await fs.promises.rename(tmp, SETTINGS_PATH)
      return { success: true }
    } catch (err: any) {
      return { error: err.message }
    }
  })
}
