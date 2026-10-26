# Linux package feasibility

This is a feasibility report only. It does not add new release targets or run
package builds.

## Current release surface

- Linux CI currently produces the unsigned AppImage and Debian package on
  `ubuntu-24.04`.
- The electron-builder configuration does not declare `rpm` or `pacman`
  targets, so neither is currently a supported artifact.
- The repository has no ARM64 Linux runner or cross-build toolchain configured.

## RPM and Pacman

RPM is feasible through electron-builder's `rpm` target on a Linux builder with
the packaging dependencies installed. Pacman is not an electron-builder target
in this repository; it would require a separately maintained PKGBUILD and an
Arch-based packaging job. Each new artifact must join the existing SHA256SUMS,
release QA, update-feed, and packaged-capability checks before being published.

## ARM64

ARM64 should be built natively on an ARM64 Linux runner or in a reproducible
ARM64 container. Cross-building the Electron runtime and native `node-pty`
dependency from x64 is not a release-quality default. The first implementation
should add an explicit ARM64 CI matrix job, native smoke coverage, and a
separate artifact naming/checksum policy rather than silently cross-compiling.

## Recommendation

Keep AppImage and Debian as the supported Linux targets for now. Add RPM first
when a target user base and native CI runner exist; add Pacman as a separate
packaging project; add ARM64 only with native CI and native packaged smoke
evidence. No new keys, accounts, or paid services are required for this work.
