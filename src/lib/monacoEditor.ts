/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Bundled Monaco for the code editor. @monaco-editor/react otherwise downloads
 * Monaco from a CDN, which the app's Content-Security-Policy blocks (and which
 * would not work offline). Lazy-loaded by CodeEditor so it stays out of startup.
 */
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

const languageLoads = new Map<string, Promise<unknown>>()

export function ensureMonacoLanguage(language: string): Promise<unknown> {
  const normalized = language === 'tsx' ? 'typescript' : language === 'jsx' ? 'javascript' : language
  if (languageLoads.has(normalized)) return languageLoads.get(normalized)!

  const load = (() => {
    switch (normalized) {
      case 'typescript':
        return import('monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution')
      case 'javascript':
        return import('monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution')
      case 'json':
        return import('monaco-editor/esm/vs/language/json/monaco.contribution')
      case 'css':
      case 'scss':
      case 'less':
        return import('monaco-editor/esm/vs/basic-languages/css/css.contribution')
      case 'html':
      case 'handlebars':
      case 'razor':
        return import('monaco-editor/esm/vs/basic-languages/html/html.contribution')
      case 'markdown':
        return import('monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution')
      case 'python':
        return import('monaco-editor/esm/vs/basic-languages/python/python.contribution')
      case 'go':
        return import('monaco-editor/esm/vs/basic-languages/go/go.contribution')
      case 'rust':
        return import('monaco-editor/esm/vs/basic-languages/rust/rust.contribution')
      case 'java':
        return import('monaco-editor/esm/vs/basic-languages/java/java.contribution')
      case 'c':
      case 'cpp':
        return import('monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution')
      case 'csharp':
        return import('monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution')
      case 'yaml':
        return import('monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution')
      case 'shell':
        return import('monaco-editor/esm/vs/basic-languages/shell/shell.contribution')
      case 'sql':
        return import('monaco-editor/esm/vs/basic-languages/sql/sql.contribution')
      case 'xml':
        return import('monaco-editor/esm/vs/basic-languages/xml/xml.contribution')
      case 'ruby':
        return import('monaco-editor/esm/vs/basic-languages/ruby/ruby.contribution')
      case 'php':
        return import('monaco-editor/esm/vs/basic-languages/php/php.contribution')
      case 'swift':
        return import('monaco-editor/esm/vs/basic-languages/swift/swift.contribution')
      case 'kotlin':
        return import('monaco-editor/esm/vs/basic-languages/kotlin/kotlin.contribution')
      case 'r':
        return import('monaco-editor/esm/vs/basic-languages/r/r.contribution')
      case 'dart':
        return import('monaco-editor/esm/vs/basic-languages/dart/dart.contribution')
      case 'graphql':
        return import('monaco-editor/esm/vs/basic-languages/graphql/graphql.contribution')
      default:
        return Promise.resolve()
    }
  })()

  languageLoads.set(normalized, load)
  return load
}

self.MonacoEnvironment = {
  async getWorker() {
    return new EditorWorker()
  },
}

loader.config({ monaco })
;(self as unknown as { __VD_MONACO?: typeof monaco }).__VD_MONACO = monaco

export { default } from '@monaco-editor/react'
