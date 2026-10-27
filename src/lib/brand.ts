/**
 * @author Virender Dhiman
 * @year 2026
 * @project PIT Agent
 * @license Proprietary. See LICENSE.
 */
import { version } from '../../package.json'
export { APP_NAME, COMPANY_NAME, LEGACY_APP_NAME } from '../../shared/brand'
import { APP_NAME, COMPANY_NAME } from '../../shared/brand'

export const APP_VERSION = version
export const APP_COMMIT = typeof __VD_COMMIT_HASH__ === 'string' ? __VD_COMMIT_HASH__ : 'local'
export const AUTHOR_NAME = 'Virender Dhiman'
export const AUTHOR_URL = 'https://virender.in'
export const REPO_URL = 'https://github.com/virrdhiman/desktop-agent'
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`
export const COPYRIGHT = `© 2025-2026 ${COMPANY_NAME}. All rights reserved.`
export const CREDIT_LINE = `${APP_NAME} by ${COMPANY_NAME} - ${AUTHOR_URL}`
