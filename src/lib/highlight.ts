/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */

const KEYWORDS: Record<string, string> = {
  js: 'const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|from|default|async|await|try|catch|throw|typeof|instanceof|in|of|true|false|null|undefined|void|delete|yield|static|super|with|debugger',
  py: 'def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|raise|with|yield|lambda|pass|break|continue|True|False|None|and|or|not|in|is|global|nonlocal|assert|del|print|self',
  go: 'func|package|import|var|const|type|struct|interface|return|if|else|for|range|switch|case|default|break|continue|go|defer|chan|map|make|new|true|false|nil',
  rs: 'fn|let|mut|const|struct|enum|impl|trait|pub|use|mod|crate|return|if|else|for|while|loop|match|break|continue|true|false|as|in|ref|move|async|await',
}

const COLORS = {
  string: 'color:#98c379',
  comment: 'color:#5c6370;font-style:italic',
  number: 'color:#d19a66',
  keyword: 'color:#c678dd',
  type: 'color:#e5c07b',
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function keywordsFor(lang?: string): string {
  if (lang === 'python' || lang === 'py') return KEYWORDS.py
  if (lang === 'go') return KEYWORDS.go
  if (lang === 'rust' || lang === 'rs') return KEYWORDS.rs
  return KEYWORDS.js
}

/**
 * Single pass over the raw code: every token is matched once and escaped once, so inserted
 * markup can never be matched again by a later rule.
 */
export function highlightSyntax(code: string, lang?: string): string {
  const token = new RegExp(
    [
      '(\'(?:[^\'\\\\\\n]|\\\\.)*\'|"(?:[^"\\\\\\n]|\\\\.)*")',
      '(#[^\\n]*)',
      '\\b(\\d+\\.?\\d*)\\b',
      '\\b(' + keywordsFor(lang) + ')\\b',
      '\\b([A-Z][a-zA-Z0-9]+)\\b',
    ].join('|'),
    'g'
  )
  let out = ''
  let last = 0
  for (const m of code.matchAll(token)) {
    const index = m.index ?? 0
    out += escapeHtml(code.slice(last, index))
    const style = m[1] ? COLORS.string : m[2] ? COLORS.comment : m[3] ? COLORS.number : m[4] ? COLORS.keyword : COLORS.type
    out += `<span style="${style}">${escapeHtml(m[0])}</span>`
    last = index + m[0].length
  }
  return out + escapeHtml(code.slice(last))
}
