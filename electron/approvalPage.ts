/**
 * @author Virender Dhiman
 * @year 2026
 * @project VD Agent
 * @license Proprietary. See LICENSE.
 */

export function escapeApprovalText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Scrollable approval page. Allow and Cancel are real links so the main process can see the choice. */
export function buildApprovalHtml(message: string, detail: string): string {
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
    <div class="actions">
      <a class="cancel" href="https://approve.vd-agent.invalid/cancel">Cancel</a>
      <a class="allow" href="https://approve.vd-agent.invalid/allow">Allow once</a>
    </div>
  </main>
</body>
</html>`
}
