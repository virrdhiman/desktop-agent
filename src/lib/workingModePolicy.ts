import type { ToolRisk } from '../../electron/toolPolicy'
import type { WorkingMode } from './layoutPersistence'

export const READ_ONLY_WORKING_MODES = new Set<WorkingMode>(['plan', 'ask', 'review'])
export function isWorkingModeReadOnly(mode: WorkingMode): boolean { return READ_ONLY_WORKING_MODES.has(mode) }
export function canRunToolInWorkingMode(mode: WorkingMode, risk: ToolRisk): boolean { return !isWorkingModeReadOnly(mode) || risk === 'read' }
export function workingModeBlockReason(mode: WorkingMode, risk: ToolRisk): string | undefined {
  return canRunToolInWorkingMode(mode, risk) ? undefined : `${mode[0].toUpperCase()}${mode.slice(1)} mode is read-only and cannot run ${risk}-risk tools.`
}
