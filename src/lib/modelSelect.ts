/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Model discovery helpers shared by the main process and the renderer.
 *
 * - Filter out model IDs that cannot serve chat completions (embeddings, audio, image, moderation, rerank).
 * - Rank the remaining chat/instruct models by coding quality first, then efficiency.
 * - Classify provider errors so callers know whether to try the next model, stop, or move on.
 */

const NON_CHAT_PATTERNS: RegExp[] = [
  /embed/,
  /rerank/,
  /moderation/,
  /guard/,
  /whisper/,
  /(^|[/\-_.])tts([\-_.]|$)/,
  /text-to-speech/,
  /speech/,
  /transcri/,
  /audio/,
  /realtime/,
  /dall-e/,
  /gpt-image/,
  /imagen/,
  /image-generation/,
  /stable-diffusion/,
  /sdxl/,
  /(^|[/\-_.])flux/,
  /(^|[/\-_.])sora/,
  /(^|[/\-_.])veo/,
  /wav2vec/,
  /codec/,
  /(^|[/\-_.])ocr/,
  /(^|[/\-_.])clip/,
  /(^|[/\-_.])bge-/,
  /(^|[/\-_.])e5-/,
  /(^|\/)text-(davinci|curie|babbage|ada)/,
  /(^|\/)(davinci|babbage)-/,
  /gpt-3\.5-turbo-instruct/,
]

export function isUsableChatModel(id: string): boolean {
  if (!id || typeof id !== 'string') return false
  const m = id.toLowerCase()
  return !NON_CHAT_PATTERNS.some((re) => re.test(m))
}

/** Known model families, strongest first. The first matching tier wins. */
const QUALITY_TIERS: [RegExp, number][] = [
  [/gpt-5|claude-(opus|sonnet)-4|gemini-(2\.5-pro|3)|grok-4|kimi-k2|glm-4\.[5-9]|qwen3-coder|qwen3-235b|deepseek-(v3|r1)|gpt-oss-120b|llama-4-maverick/, 130],
  [/llama-?3\.3.*70b|llama-?3\.1.*405b|qwen2\.5-72b|qwen2\.5-coder-32b|qwen3|gemini-2\.5-flash(?!-lite)|gpt-4\.1(?!-mini|-nano)|gpt-4o(?!-mini)|claude-3[.-][57]-sonnet|mistral-large|grok-3|llama-4-scout|deepseek-chat|deepseek-coder/, 120],
  [/gemini-2\.0-flash(?!-lite)|gpt-4\.1-mini|mistral-medium|codestral|devstral|command-a|gpt-oss-20b|gemma-3-27b/, 105],
  [/gpt-4o-mini|gemini.*flash-lite|claude.*haiku|mistral-small|ministral|gemma/, 80],
]

function parameterBillions(m: string): number | null {
  const moe = m.match(/(\d+)x(\d+(?:\.\d+)?)b\b/)
  if (moe) return Number(moe[1]) * Number(moe[2])
  const sizes = [...m.matchAll(/(\d+(?:\.\d+)?)b\b/g)].map((x) => Number(x[1]))
  return sizes.length ? Math.max(...sizes) : null
}

function sizeScore(billions: number): number {
  if (billions >= 100) return 110
  if (billions >= 60) return 100
  if (billions >= 27) return 80
  if (billions >= 12) return 60
  if (billions >= 7) return 40
  return 15
}

export function scoreModel(id: string): number {
  if (!isUsableChatModel(id)) return -1000
  const m = id.toLowerCase()

  const b = parameterBillions(m)
  let score = QUALITY_TIERS.find(([re]) => re.test(m))?.[1] ?? 0
  if (score === 0) score = b === null ? 30 : sizeScore(b)
  else if (b !== null && b < 20) score = Math.min(score, sizeScore(b) + 10)

  if (m.endsWith(':free') || m.endsWith('/free')) score += 15
  if (/coder|code/.test(m)) score += 8
  if (/instruct|chat|versatile|turbo|flash/.test(m)) score += 5
  if (/latest/.test(m)) score += 2
  // Slow chain-of-thought output and unstable previews are worse for a tool loop.
  if (/thinking|reasoning|(^|[/\-_])r1([\-_:]|$)|qwq/.test(m)) score -= 10
  if (/preview|experimental|(^|[\-_])exp([\-_]|$)|beta|alpha/.test(m)) score -= 8
  if (/nano|tiny/.test(m)) score -= 20

  return score
}

export function normalizeModelId(id: string): string {
  return id.trim().replace(/^models\//, '')
}

/**
 * Rank usable chat models. When the list contains OpenRouter-style `:free` variants,
 * only those are kept — a free key usually cannot call the paid ones.
 */
export function rankModels(ids: string[]): string[] {
  const usable = [...new Set(ids.map(normalizeModelId).filter(isUsableChatModel))]
  const free = usable.filter((id) => id.endsWith(':free'))
  const pool = free.length > 0 ? free : usable
  return pool.sort((a, b) => scoreModel(b) - scoreModel(a) || a.localeCompare(b))
}

export const MAX_MODEL_ATTEMPTS = 6

/** Strongest discovered chat models first; the configured model is kept as the final fallback. */
export function buildModelAttemptList(
  preferred: string | undefined,
  discovered: string[],
  max = MAX_MODEL_ATTEMPTS
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const add = (id?: string) => {
    const name = id?.trim()
    if (!name || seen.has(name)) return
    seen.add(name)
    out.push(name)
  }
  for (const id of rankModels(discovered).slice(0, Math.max(1, max - 1))) add(id)
  add(preferred)
  return out
}

export type ModelErrorKind = 'auth' | 'retry-model' | 'other'

const AUTH_TEXT =
  /unauthori[sz]ed|invalid[_ ]?api[_ ]?key|incorrect api key|api key not valid|api_key_invalid|invalid[_ ]?(auth|token|credentials)|authentication (failed|error|required)|missing (api key|authorization)|no api key/

const RETRY_TEXT =
  /model[_ ]?not[_ ]?found|does not exist|unknown model|invalid model|no such model|model .{0,60}not (found|available|supported)|not a valid model|decommissioned|deprecated|no longer (available|supported)|unsupported model|model is not supported|no endpoints found|rate[_ ]?limit|too many requests|quota|resource[_ ]exhausted|capacity|overloaded|temporarily unavailable|service unavailable|insufficient credits|payment required/

export function extractStatus(message: string): number | undefined {
  const m = message.match(/\((\d{3})\)/) || message.match(/\b(401|402|403|404|408|429|500|502|503|504|529)\b/)
  return m ? Number(m[1]) : undefined
}

/**
 * - `auth`: bad or missing key. Retrying other models or providers hides the real problem.
 * - `retry-model`: this model is unavailable, rate-limited, or overloaded. Try the next model.
 * - `other`: request-level failure (bad payload, context too long, network). Not model-specific.
 */
export function classifyModelError(message: string, status?: number): ModelErrorKind {
  const t = (message || '').toLowerCase()
  const code = status ?? extractStatus(t)

  if (code === 401 || AUTH_TEXT.test(t)) return 'auth'
  if (code === 403) return /model/.test(t) ? 'retry-model' : 'auth'
  if (code !== undefined && [402, 404, 408, 429, 502, 503, 504, 529].includes(code)) return 'retry-model'
  if (RETRY_TEXT.test(t)) return 'retry-model'
  return 'other'
}

export function isRetryableModelError(message: string, status?: number): boolean {
  return classifyModelError(message, status) === 'retry-model'
}

export function isAuthError(message: string, status?: number): boolean {
  return classifyModelError(message, status) === 'auth'
}
