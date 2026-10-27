export const COMMON_SYMBOLS = [
  'async', 'await', 'const', 'let', 'function', 'return', 'import', 'export', 'type', 'interface',
  'class', 'extends', 'implements', 'try', 'catch', 'finally', 'Promise', 'Array', 'Record',
]

export function completionWords(text: string, filePaths: string[], openFiles: string[]): string[] {
  const words = new Set<string>(COMMON_SYMBOLS)
  const wordMatches = text.match(/\b[A-Za-z_$][\w$]{2,}\b/g) || []
  for (const word of wordMatches) words.add(word)
  for (const file of [...filePaths, ...openFiles]) {
    const normalized = file.replace(/\\/g, '/')
    const base = normalized.split('/').pop() || ''
    const stem = base.replace(/\.[^.]+$/, '')
    for (const part of normalized.split(/[/.\\_-]+/)) if (/^[A-Za-z_$][\w$]{2,}$/.test(part)) words.add(part)
    if (/^[A-Za-z_$][\w$]{2,}$/.test(stem)) words.add(stem)
  }
  return [...words].slice(0, 500)
}

export function filterCompletionWords(words: string[], prefix: string): string[] {
  const normalized = prefix.toLowerCase()
  return words.filter((word) => !normalized || word.toLowerCase().includes(normalized)).slice(0, 80)
}
