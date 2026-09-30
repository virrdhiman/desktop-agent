/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */
/**
 * Link and navigation policy for the main window (pure, unit tested).
 * External web links open in the system browser; the app window never
 * navigates away from the app itself.
 */

/** True for http(s) URLs that may be handed to the system browser. */
export function isExternalWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/** True when `target` stays on the page the app window is currently showing. */
export function isSameAppPage(target: string, current: string): boolean {
  try {
    const t = new URL(target)
    const c = new URL(current)
    if (t.protocol !== c.protocol) return false
    return t.protocol === 'file:' ? t.pathname === c.pathname : t.origin === c.origin
  } catch {
    return false
  }
}
