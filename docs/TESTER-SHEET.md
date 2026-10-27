# PIT Agent 1.2.0 tester sheet

Packaged application source commit: `0c1ef47` (the app also shows its exact build commit in Settings → About).

This is an unsigned Windows test build for a local, fixture-only evaluation. It is not a public release.

## Install and first run

1. Run the installer. Windows SmartScreen may warn because this build is unsigned: choose **More info** → **Run anyway**.
2. Start PIT Agent from the desktop or Start menu shortcut.
3. On first run, open **Settings** and add an API key only if you want cloud models. Never paste a key into a bug report, screenshot, chat export, or log. Ollama can be used locally without a cloud key.
4. In Settings, note the displayed app version and build commit before reporting a problem.

## Fifteen-minute click-through

1. In Agent view, start a new chat and send a short question.
2. Type a multiline prompt and confirm the composer grows without clipping.
3. Open the model picker and check the Efficient, Balanced, and Powerful tabs.
4. Move the effort slider between Low, Medium, and High; it changes prompt style only.
5. Switch working mode between Plan, Build, Multitask, Ask, Review, and Debug.
6. Open the **+** menu and try Files and folders, Goal, and Plan mode.
7. Open the right-side Browser, Files, Terminal, and Changes tabs; Browser is search-results-only.
8. Press Ctrl+` and run a harmless command in a terminal tab.
9. Choose Code or press Ctrl+Shift+E to open the IDE window.
10. In the IDE, use Open Folder and open a small test project.
11. Open a file, edit it, save it, and confirm the dirty marker clears.
12. Use the explorer to rename a fixture file, then delete it only after confirming the prompt.
13. Open the Git panel, review a diff, stage a fixture change, and create a local commit.
14. Return to Agent view and try **Summarize & continue**, **Fork chat**, and **Fork from here** on a long conversation.
15. Close and reopen the app. Confirm chats, settings, layout, and the IDE window state are still available.

## Reporting a bug

Include a screenshot, the exact steps that led to the problem, what you expected, what happened, and the version/build commit shown in **Settings → About**. Do not include API keys or private project files.

## Known limits

- The Browser tab currently displays search results; it is not a general-purpose browser tab.
- The effort slider is prompt style only; providers are not given a separate reasoning parameter by this build.
- This installer is unsigned and may show SmartScreen warnings.
- Local model quality and latency depend on the installed model and machine hardware.
