/** Browser inputs/content may contain secrets. Activity logs keep only the operation. */
export function toolActivityArgs(name: string, args: Record<string, any>): Record<string, any> {
  if (name !== 'browser') return args
  return { operation: ['open_url', 'open', 'read_page_text', 'read', 'screenshot'].includes(args.operation) ? args.operation : 'invalid' }
}

export function toolActivityResult(name: string, result: string, ok: boolean): string {
  if (name !== 'browser') return result
  return ok ? 'Browser operation completed. Page details omitted from activity logs.' : 'Browser operation failed. Page details omitted from activity logs.'
}
