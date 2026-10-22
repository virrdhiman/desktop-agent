import path from 'node:path'
import fs from 'node:fs/promises'
import { loadPlaywright } from './qa-helper.mjs'

const exe = path.resolve(process.argv[2])
const userData = path.resolve(process.argv[3])
const playwright = loadPlaywright()
const app = await playwright._electron.launch({
  executablePath: exe,
  args: ['--remote-debugging-port=0', `--user-data-dir=${userData}`],
  env: { ...process.env, VD_AGENT_DISABLE_ENV_IMPORT: '1' },
})
try {
  const page = await app.firstWindow()
  await page.waitForTimeout(1500)
  const result = await page.evaluate(async () => ({
    settings: await window.api.loadSettings(),
    conversations: await window.api.listConversations(),
  }))
  console.log(JSON.stringify({
    ok: result.settings?.autoUpdate === true && result.conversations.some((item) => item.id === 'update-preservation'),
    autoUpdate: result.settings?.autoUpdate,
    conversationIds: result.conversations.map((item) => item.id),
  }, null, 2))
} finally {
  await app.close()
}
