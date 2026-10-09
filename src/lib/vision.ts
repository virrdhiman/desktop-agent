export type AttachedImage = { data: string; name: string }

const MAX_IMAGES = 4
const MAX_TOTAL_BYTES = 10 * 1024 * 1024
const IMAGE_DATA = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/i

export function imageAttachmentError(images: AttachedImage[]): string | null {
  if (images.length > MAX_IMAGES) return `Attach no more than ${MAX_IMAGES} images per request.`
  let bytes = 0
  for (const image of images) {
    const match = image.data.match(IMAGE_DATA)
    if (!match) return 'Only PNG, JPEG, WebP, and GIF images can be sent to the model.'
    bytes += Math.floor(match[2].length * 3 / 4) - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0)
  }
  return bytes > MAX_TOTAL_BYTES ? 'Attached images exceed the 10 MB per-request limit.' : null
}

export function withImageContent(messages: { role: string; content: string }[], images: AttachedImage[]) {
  if (images.length === 0) return messages
  let index = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { index = i; break }
  }
  if (index < 0) return messages
  return messages.map((message, i) => i === index ? {
    ...message,
    content: [
      { type: 'text', text: message.content },
      ...images.map((image) => ({ type: 'image_url', image_url: { url: image.data } })),
    ],
  } : message)
}

export function toAnthropicContent(content: string | unknown[]): string | unknown[] {
  if (!Array.isArray(content)) return content
  return content.map((part: any) => {
    if (part?.type !== 'image_url') return part
    const match = String(part.image_url?.url || '').match(IMAGE_DATA)
    if (!match) return part
    return { type: 'image', source: { type: 'base64', media_type: match[1].toLowerCase(), data: match[2] } }
  })
}
