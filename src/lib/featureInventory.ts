export const CURRENT_FEATURE_IDS = ['chat', 'files', 'git', 'branches', 'tasks', 'sessions', 'vscode', 'terminal', 'settings', 'help'] as const
export const REQUIRED_LAYOUT_FEATURES = ['projects', 'chats', 'file-tree', 'history', 'browser', 'changes', 'terminal', 'composer', 'settings', 'code-switch'] as const
export function hasAllRequiredFeatures(features: readonly string[]): boolean { return REQUIRED_LAYOUT_FEATURES.every((feature) => features.includes(feature)) }
