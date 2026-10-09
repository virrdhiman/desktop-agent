import { describe, expect, it } from 'vitest'
import { imageAttachmentError, toAnthropicContent, withImageContent } from './vision'

const image = { name: 'screen.png', data: 'data:image/png;base64,aGVsbG8=' }

describe('image chat content', () => {
  it('sends image bytes with the newest user request only', () => {
    const messages = [
      { role: 'system', content: 'Guide' },
      { role: 'user', content: 'Earlier request' },
      { role: 'assistant', content: 'Earlier answer' },
      { role: 'user', content: 'What is wrong with this screen?' },
    ]
    const result = withImageContent(messages, [image])
    expect(result[1].content).toBe('Earlier request')
    expect(result[3].content).toEqual([
      { type: 'text', text: 'What is wrong with this screen?' },
      { type: 'image_url', image_url: { url: image.data } },
    ])
    expect(messages[3].content).toBe('What is wrong with this screen?')
  })

  it('converts image content for Anthropic Messages', () => {
    const content = withImageContent([{ role: 'user', content: 'Read this' }], [image])[0].content
    expect(toAnthropicContent(content)).toEqual([
      { type: 'text', text: 'Read this' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
    ])
  })

  it('rejects unsupported or excessive attachments before sending', () => {
    expect(imageAttachmentError([image])).toBeNull()
    expect(imageAttachmentError([{ name: 'a.svg', data: 'data:image/svg+xml;base64,abc=' }])).toMatch(/PNG/)
    expect(imageAttachmentError(Array(5).fill(image))).toMatch(/no more than 4/)
  })
})
