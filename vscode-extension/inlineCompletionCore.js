function isCompletionCurrent(requestId, latestRequestId, cancelled = false) {
  return !cancelled && requestId === latestRequestId
}

function cleanInlineCompletion(raw, before) {
  let text = String(raw || '')
    .replace(/```[a-zA-Z0-9_-]*\n?/g, '')
    .replace(/```/g, '')
    .replace(/^<INSERT_COMPLETION>/i, '')
    .trimEnd()
  const beforeTail = String(before || '').slice(-120)
  for (let i = Math.min(text.length, beforeTail.length); i > 8; i--) {
    if (beforeTail.endsWith(text.slice(0, i))) {
      text = text.slice(i)
      break
    }
  }
  const lines = text.split('\n')
  if (lines.length > 8) text = lines.slice(0, 8).join('\n')
  if (text.length > 600) text = text.slice(0, 600)
  return text
}

module.exports = { cleanInlineCompletion, isCompletionCurrent }
