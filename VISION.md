# VD Agent vision

VD Agent is a local-first desktop engineering workspace for people who want an
AI coding partner without giving up control of their files, credentials, or
review process.

## Goal

Make the safe path the convenient path: inspect before editing, ask before
risky actions, preserve checkpoints, verify claims with real tests, and make
provider/runtime boundaries obvious.

## Target users

- Developers who work across local repositories and free or local AI providers.
- Teams that need reviewable agent traces rather than opaque automation.
- Privacy-conscious users who want local sessions, Ollama, VS Code, and
  optional browser access without mandatory cloud sync.

## Product direction

The project should compete on control, reproducibility, recovery, and honest
capability reporting—not on an unsupported claim that it is universally better
than another editor. Future work should add capability only when it has a
setting boundary, approval behavior, tests, and a documented failure mode.

## Success criteria

1. A new user can start with no paid account and understand what is local,
   optional, or externally required.
2. A risky action is visible, bounded, and recoverable.
3. A release can prove its packaged resources on every native CI platform.
4. A test or evidence receipt exists before the app reports success.
