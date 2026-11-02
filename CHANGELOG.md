# Changelog

## Unreleased

- The extractor nests unbound code by directory: `apps/web/x.ts` is a component `web` inside a subsystem `apps` (was a flat `apps_web`), so an emitted or `init`-generated repository reads as subsystems from the start.
- Viewer: the wheel zooms about the pointer (shift-wheel pans); the layout folds long dependency chains into a grid that fits the panel, and re-fits when the panel is resized or the inspector toggled; neighbouring boxes in a column connect with straight vertical arrows.

- **Hesperus: Create Intent From Code** and `hesp init`: describe a repository already under way as an intent that matches its actual exactly, then track changes from there. Adds `.hesperus/` to `.gitignore`.
- The Hesperus sidebar is back, simpler: intent, actual and diff counts, Emit and Open Viewer, and a Create Intent From Code button when the workspace has no intent.

## 0.1.0

First release: language support through hesperus-lsp, the Intent / Actual / Unified viewer, and the emit command.
