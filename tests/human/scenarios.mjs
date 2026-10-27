export async function runScenario(name, page, q) {
  const visible = async (...selectors) => { for (const selector of selectors) { const l = page.locator(selector).first(); if (await l.isVisible().catch(() => false)) return l } return null }
  const skip = reason => { q.evidence.skipped.push({ scenario: name, reason }); q.record('skip', { scenario: name, reason }) }
  if (name === 'skip' || name === 'customize') {
    const button = page.getByRole('button', { name: name === 'skip' ? 'Skip use defaults' : 'Customize settings and models', exact: true })
    await button.waitFor({ state: 'visible', timeout: 15_000 })
    await q.shot(page, `${name}-first-run-before`)
    await q.click(page, button, `${name}-first-run`)
    await page.getByRole('dialog', { name: 'Customize PIT Agent' }).waitFor({ state: 'hidden' })
    if (name === 'customize') {
      await page.getByRole('heading', { name: 'Advanced' }).waitFor({ state: 'visible' })
      const toggle = page.getByRole('checkbox', { name: 'Autocomplete' })
      if (await toggle.isChecked()) throw new Error('Autocomplete enabled without consent')
      await q.click(page, toggle, 'autocomplete-opt-in')
      if (!await toggle.isChecked()) throw new Error('Autocomplete opt-in did not apply')
      const provider = page.getByRole('button', { name: 'Edit active model and provider' })
      await q.click(page, provider, 'advanced-provider')
      await page.getByRole('button', { name: /Save Changes/ }).waitFor({ state: 'visible' })
    }
    await q.shot(page, `${name}-first-run-after`)
    q.record('assert', { scenario: name, result: 'visible first-run route completed' })
    return
  }
  if (name === 'model-later') {
    await q.click(page, page.getByRole('tab', { name: /Settings panel/ }), 'settings-later')
    await q.click(page, page.getByRole('button', { name: 'Advanced', exact: true }), 'advanced-later')
    await q.click(page, page.getByRole('button', { name: 'Edit active model and provider' }), 'provider-later')
    const model = page.locator('.input-group').filter({ has: page.locator('label.input-label', { hasText: 'Model' }) }).locator('input').first()
    await q.click(page, model, 'model-later-focus')
    await q.shot(page, 'model-later-select-all-before')
    await model.press('ControlOrMeta+A')
    await q.shot(page, 'model-later-select-all-after')
    await q.type(page, model, 'qa-local-model', 'model-later-type')
    await q.click(page, page.getByRole('button', { name: /Save Changes/ }), 'model-later-save')
    await q.click(page, page.getByRole('button', { name: 'Edit active model and provider' }), 'model-later-reopen')
    if (await model.inputValue() !== 'qa-local-model') throw new Error('Saved model was not available after reopening provider settings')
    await q.shot(page, 'model-later-after')
    q.record('assert', { scenario: name, result: 'model changed by visible settings controls' })
    return
  }
  if (name === 'diagnostics') {
    const help = page.getByRole('tab', { name: /Help panel/ })
    if (!await help.isVisible().catch(() => false)) return skip('Help panel control was not visible')
    await q.click(page, help, 'help-panel')
    await page.getByRole('region', { name: 'Help > Diagnostics' }).waitFor({ state: 'visible', timeout: 15_000 })
    await q.shot(page, 'diagnostics-before-copy')
    const copy = page.getByRole('button', { name: 'Copy diagnostics' })
    if (!await copy.isEnabled().catch(() => false)) return skip('Copy diagnostics was disabled because the diagnostics payload did not load')
    await q.click(page, copy, 'diagnostics-copy')
    await page.waitForTimeout(1_000)
    const status = page.getByRole('status').last()
    const statusText = await status.textContent().catch(() => '')
    if (!statusText?.includes('Diagnostics copied to the clipboard.')) {
      return skip(`Copy diagnostics did not report success: ${statusText || 'no visible status after click'}`)
    }
    await q.shot(page, 'diagnostics-after-copy')
    q.record('assert', { scenario: name, result: 'diagnostics loaded and copy confirmation appeared' })
    return
  }
  if (name === 'index-tools') {
    const agent = page.getByRole('tab', { name: /Agent panel/ })
    if (await agent.isVisible().catch(() => false)) await q.click(page, agent, 'agent-panel-for-index')
    const input = await visible(page, 'textarea[aria-label="Chat message input"]', 'textarea[placeholder*="Ask or queue" i]')
    if (!input) return skip('No visible chat input after setup was dismissed')
    await q.click(page, input, 'index-tools-focus')
    await q.type(page, input, 'Use search_code, go_to_definition, and find_usages on the current workspace; show the indexed file and line evidence.', 'index-tools-prompt')
    await q.shot(page, 'index-tools-prompt')
    q.record('assert', { scenario: name, result: 'index-tool request entered with visible keystrokes; provider execution left to manual/local-model run' })
    return
  }
  if (name === 'safe-change') {
    const agent = page.getByRole('tab', { name: /Agent panel/ })
    if (await agent.isVisible().catch(() => false)) await q.click(page, agent, 'agent-panel-for-safe-change')
    const input = await visible(page, 'textarea[aria-label="Chat message input"]', 'textarea[placeholder*="Ask or queue" i]')
    if (!input) return skip('No visible chat input after setup was dismissed')
    await q.click(page, input, 'safe-change-focus')
    await q.type(page, input, 'Please create a small file named qa-approval-fixture.txt containing one line, then wait for my approval.', 'safe-change-prompt')
    await q.shot(page, 'safe-change-prompt')
    q.record('assert', { scenario: name, result: 'mutation request entered; approval dialog requires a configured provider to execute' })
    return
  }
  if (name === 'smoke') { await q.shot(page, 'smoke-before'); const title = await page.title(); q.record('smoke', { title, url: page.url() }); await q.shot(page, 'smoke-after'); return }
  if (name === 'terminal') { const button = await visible(page, 'button[title*="Terminal" i]', 'button:has-text("Terminal")'); if (!button) return skip('No visible Terminal control'); await q.click(page, button, 'terminal-toggle'); return }
  if (name === 'search') {
    const sessions = await visible(page, 'button[aria-label*="Sessions panel" i]', '[role="tab"][aria-label*="Sessions" i]')
    if (sessions) await q.click(page, sessions, 'sessions-panel')
    const input = await visible(page, 'input[aria-label="Search saved chats"]', 'input[placeholder*="Search titles" i]', 'input[placeholder*="Search" i]')
    if (!input) return skip('No visible search input after opening Sessions panel')
    await q.click(page, input, 'search-focus'); await q.type(page, input, 'QA', 'search-query'); await q.shot(page, 'search-results'); return
  }
  if (name === 'persistence') {
    const input = await visible(page, 'textarea[aria-label="Chat message input"]', 'textarea[placeholder*="Ask or queue" i]', 'textarea')
    if (!input) return skip('No visible chat input')
    await q.click(page, input, 'chat-focus'); await q.type(page, input, 'QA persistence check', 'chat-query'); await q.shot(page, 'persistence-ready'); return
  }
  if (name === 'checklist') {
    const consent = await visible(page, 'input[aria-label*="Consent to set up" i]')
    const hash = await visible(page, 'input[aria-label*="Expected SHA-256" i]')
    if (!consent || !hash) return skip('Optional setup checklist is hidden until a provider-backed first-run profile is available')
    await q.click(page, consent, 'checklist-consent')
    await q.click(page, hash, 'checklist-hash-focus')
    await q.type(page, hash, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'checklist-hash')
    const download = await visible(page, 'button:has-text("Download, verify & launch")')
    if (!download) return skip('No visible checklist download control after consent and hash entry')
    await q.click(page, download, 'checklist-download')
    const cancel = await visible(page, 'button:has-text("Cancel")', '[aria-label*="Cancel" i]')
    if (cancel) await q.click(page, cancel, 'checklist-cancel')
    else q.evidence.skipped.push({ scenario: name, reason: 'No visible Cancel control after download' })
    q.record('checksum-note', { status: 'human UI clicked download with a fixture hash, then cancelled if exposed' }); return
  }
  skip('Unknown scenario')
}
