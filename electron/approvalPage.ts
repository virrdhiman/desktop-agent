/**
 * @author Virender Dhiman
 * @year 2026
 * @project PIT Agent
 * @license Proprietary. See LICENSE.
 */

export function escapeApprovalText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Scrollable approval page. Actions are real navigations so the main process can see the choice. */
export function buildApprovalHtml(message: string, detail: string, editable?: string): string {
  const editor = editable === undefined ? '' : `
    <label for="payload">Proposed payload</label>
    <textarea id="payload">${escapeApprovalText(editable)}</textarea>`
  const editScript = editable === undefined ? '' : `
    <script>
      document.querySelector('.edit').addEventListener('click', function (event) {
        event.preventDefault()
        const payload = document.getElementById('payload').value
        location.href = 'https://approve.vd-agent.invalid/edit?payload=' + encodeURIComponent(payload)
      })
    </script>`
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Approve agent action</title>
  <style>
    body { margin: 0; font: 13px/1.45 ui-sans-serif, system-ui, sans-serif; background: #1e1e1e; color: #e6e6e6; }
    main { display: flex; flex-direction: column; height: 100vh; padding: 16px; box-sizing: border-box; }
    h1 { margin: 0 0 8px; font-size: 15px; font-weight: 650; }
     pre { flex: 1; margin: 0; padding: 10px; overflow: auto; white-space: pre-wrap; word-break: break-word; background: #111; border: 1px solid #333; border-radius: 6px; font: 12px/1.4 ui-monospace, monospace; }
     label { margin: 10px 0 4px; font-weight: 600; }
     textarea { width: 100%; min-height: 100px; box-sizing: border-box; resize: vertical; background: #111; color: #e6e6e6; border: 1px solid #555; border-radius: 6px; padding: 8px; font: 12px/1.4 ui-monospace, monospace; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
    a { display: inline-block; padding: 7px 14px; border-radius: 6px; text-decoration: none; color: #fff; }
    .cancel { background: #3a3a3a; }
    .allow { background: #b45309; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeApprovalText(message)}</h1>
    <pre>${escapeApprovalText(detail)}</pre>
    ${editor}
    <div class="actions">
      <a class="cancel" href="https://approve.vd-agent.invalid/reject">Reject</a>
      ${editable === undefined ? '' : '<a class="edit" href="https://approve.vd-agent.invalid/edit">Edit</a>'}
      <a class="allow" href="https://approve.vd-agent.invalid/allow">Approve</a>
    </div>
  </main>
  ${editScript}
</body>
</html>`
}
