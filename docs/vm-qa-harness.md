# Windows and Ubuntu VM QA harness

`scripts/vm-qa-harness.mjs` is a Node-only, evidence-only checklist generator.
It is designed for release QA when an Electron Builder output directory may be
locked or stale:

- it accepts explicit artifact, ISO, and checklist paths;
- it checks package filenames, sizes, and the source VSIX;
- it writes one new checklist with exclusive-create semantics;
- it never creates, starts, controls, or deletes a VM;
- it never downloads or mounts an ISO;
- it never reads credentials or copies/deletes user data.

The caller must create or start a VM separately and manually. This repository
does not download an operating-system image as part of QA.

## Generate Windows instructions

```bash
node scripts/vm-qa-harness.mjs \
  --platform windows \
  --artifacts release \
  --output .work/mac-test/windows-qa.md \
  --iso "C:/explicit/path/windows.iso"
```

`--iso` is optional evidence only. If supplied, it must already exist; the
harness does not fetch it.

## Generate Ubuntu instructions

```bash
node scripts/vm-qa-harness.mjs \
  --platform ubuntu \
  --artifacts release \
  --output .work/mac-test/ubuntu-qa.md
```

Run the package capability gate from the generated checklist with an explicit
unpacked resources path. The validator is a gate for Windows, macOS, and Linux;
the harness does not infer a VM manager or silently fall back to another path.

## Artifact/version rules

The expected installer names are derived from `package.json` every time the
script runs. A checklist for a different version must be generated after the
version bump. Missing artifacts are reported in the checklist and cause the
command to exit non-zero after writing the evidence; the existing files remain
untouched.
