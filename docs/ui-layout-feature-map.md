# PIT Agent layout feature map

The layout shell is additive: existing panels remain mounted through the same `activePanel` routes, while the shell gives them clearer destinations.

| Existing feature | Previous place | New place |
| --- | --- | --- |
| Agent chat, queue, stop, agentic roles | Sidebar Agent panel | Center Agent output tab and composer |
| Sessions search/resume/rename/pin/delete/export/checkpoints | Sessions panel | Context pane → Chats/Search tabs; full Sessions panel remains available |
| File browser and editor | Sidebar Files + chat split | Workspace sidebar file tree, Files launcher, center editor tab |
| Git status/diff/stage/commit/push/pull/branches/stash | Sidebar Git/Branches | Workspace Tools → Git/Branches and Changes launcher |
| Tasks | Sidebar Tasks | Workspace Tools → Tasks |
| Terminal tabs and output | Sidebar Terminal / bottom terminal | Workspace Tools, quick launcher, and terminal above the composer |
| VS Code bridge | Sidebar VS Code | Workspace Tools → VS Code bridge and Code surface switch |
| Settings and provider/model setup | Sidebar Settings | Left rail Settings, avatar menu, and unchanged Settings page |
| Help and shortcuts | Sidebar Help / command palette | Avatar menu Docs/Shortcuts and top Help menu |
| Command palette | Sidebar search | Ctrl+P, Edit menu, and avatar Shortcuts |

Layout preferences are versioned and additive under `settings.layout`; existing settings and local conversations are not migrated destructively.
