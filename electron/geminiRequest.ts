/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */

export const GEMINI_IMAGE_MODEL_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

/** Gemini accepts the key in the x-goog-api-key header, so it never lands in the URL. */
export function geminiGenerateContentRequest(apiKey: string, body: unknown): { url: string; init: RequestInit } {
  return {
    url: GEMINI_IMAGE_MODEL_URL,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    },
  }
}
