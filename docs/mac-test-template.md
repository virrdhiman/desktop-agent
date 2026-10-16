<!--
  @project VD Agent
  @license Proprietary. See LICENSE.
-->

# macOS release QA checklist

This template is intentionally tracked in `docs/`; generated copies belong in
the ignored `.work/` directory. Generate a dated, unique copy without touching
an installer or deleting any existing file:

```bash
node scripts/generate-mac-test-checklist.mjs
```

The generator writes only a new checklist under `.work/mac-test/`. Use
`--output .work/mac-test/my-checklist.md` for an explicit destination; an
existing destination is never overwritten.

## Build evidence

- [ ] Record the package version from `package.json`: `{{VERSION}}`.
- [ ] Run `npm run release:preflight` and review lock, stale-entry, path-length,
      active-artifact, and source-VSIX evidence.
- [ ] Build on macOS with an explicit, unique output directory recommended by
      the preflight. Do not reuse an output directory that contains active
      artifacts.
- [ ] Confirm the output directory is: `{{ARTIFACT_ROOT}}`.
- [ ] Confirm the expected application executable exists at:
      `{{APP_PATH}}`.
- [ ] Run the packaged capability gate for the macOS resources directory:

  ```bash
  node scripts/validate-packaged-capabilities.mjs \
    --platform darwin \
    --resources "{{RESOURCES_PATH}}"
  ```

- [ ] Confirm DMG/ZIP names contain exactly package version `{{VERSION}}`.
- [ ] Confirm `SHA256SUMS.txt` is generated from the same output directory.

## Clean-machine checks

- [ ] Open the app from the DMG on a clean macOS user account or approved QA
      machine. This checklist does not create a VM or download an OS image.
- [ ] Verify Gatekeeper behavior matches the signing status. For a signed
      release, run `codesign --verify --deep --strict` and `spctl -a -vv`.
- [ ] Launch the app, open a workspace, and verify the renderer and terminal
      start.
- [ ] Run one no-credential local smoke path (settings load, workspace open,
      and a local fixture/provider request if available). Do not add real keys
      to this checklist or repository.
- [ ] Restart the app and confirm chat/history/settings remain available.
- [ ] If VS Code is installed for QA, load the packaged source VSIX and verify
      the bridge export/status flow.
- [ ] Uninstall by moving the app from Applications to Trash and confirm user
      data is retained unless the tester explicitly removes it.

## Update-feed checks

- [ ] Validate the metadata-only fixture without an installer:

  ```bash
  npm run release:update-fixture
  ```

- [ ] If local installer bytes are available, validate them from an explicit
      directory with `--artifacts`; the harness never downloads or launches
      them.
