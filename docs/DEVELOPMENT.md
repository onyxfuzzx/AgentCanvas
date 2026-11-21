# Development and verification

## Prerequisites

Use a Windows x64 development machine with Node.js 22 (the CI baseline), npm, Rust stable MSVC, Visual Studio C++ build tools with a Windows SDK, Git and WebView2 Evergreen. See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/). Provider CLIs are optional, installed separately and never needed for deterministic fixtures.

```powershell
npm ci
cargo install tauri-cli --version '^2' --locked
```

The committed npm and Cargo lockfiles are part of reproducibility. Fresh online installation and replacement of the historical prerelease xterm pins remain public-launch qualification; see [THIRD_PARTY.md](../THIRD_PARTY.md). Do not copy dependency files from other products as contributor setup.

## Run

```powershell
npm run dev
npm run desktop
```

Run one command appropriate to your task. `dev` serves the browser UI at the Vite development address; it cannot start native terminals. `desktop` starts the native development host and its frontend server.

For an editor development host, run `npm run extension:build -- --debug` first, then use the committed **AgentCanvas Extension** VS Code launch configuration. Build sources remain in `src/`, `src-tauri/` and `extension/`; generated payloads are ignored.

## Verify in the right order

```powershell
npm run repo:audit
npm run native:check
npm run extension:build -- --debug
npm run check
```

`npm run check` covers formatting, lint, frontend types/tests/build and extension types/tests. Native extension cases require the sidecar: build it first on a fresh checkout. Tests can target a particular backend through `AGENTCANVAS_EDITOR_TEST_BINARY`; document the binary/profile used. GitHub CI builds the sidecar before the full extension checks so those cases execute.

`npm run native:check` runs Rust format checking, Clippy with warnings denied, library tests and native integration fixtures. Its mixed-provider fixture launches local stand-ins and makes no provider calls. Optional Git Bash qualification runs separately:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --locked --test conpty -- --ignored --nocapture
```

Use disposable workspaces/projects. Keep real-provider tests explicit and record CLI versions, authentication, trust prompts and actual acceptance evidence. Automated checks do not close UI, DPI, accessibility, installer or real-provider gates by themselves.

## Package

| Command                                        | Output                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `npm run desktop:build`                        | Optimized Windows portable folder/ZIP, manifest and checksums under `artifacts/`. |
| `npm run desktop:release`                      | Portable artifacts plus NSIS/MSI installers.                                      |
| `npm run extension:package`                    | Windows VSIX with the native backend/helpers, project license and notices.        |
| `npm run extension:package -- --smoke-support` | The same package plus ignored local editor-runner support bundles.                |

Keep the desktop executable and both helpers together. Set `AGENTCANVAS_BUILD_TAG` to a validated lowercase tag to preserve separate desktop candidates. Project license/notices are copied into portable output; complete third-party notice review and installer licensing remain release gates. Packages remain unsigned unless signing is explicitly configured.

Run both installed editors with fresh repository-local profiles:

```powershell
node scripts/extension-editor-run.mjs all my-fresh-tag
```

This requires the installed Windows editors and a build with `--smoke-support`. It exercises real renderer/save/close and backend restart/reload flows. It does not install into normal profiles or submit provider tasks. Test profiles disable workspace trust for unattended tests; production trust gates stay enabled. Evidence is written under ignored `.cache/extension-smoke/`.

## Restricted development hosts

If subprocess restrictions prevent Vite/esbuild, `CANVAS_NO_SUBPROCESS=1` enables the existing in-process frontend verification fallback. It is not a substitute for a normal clean install/build or native Windows qualification. Record which mode ran rather than claiming the ordinary toolchain passed.

Formatting uses Git's tracked/non-ignored source inventory, avoiding private/generated folders. Run `npm run format` to apply formatting. Keep `.gitignore` and `.gitattributes` changes scoped; never blanket-ignore source JSON or Markdown.

## Before public publication

Run `npm run repo:audit -- --history --public`, review commit email identities and inspect release artifacts separately. The audit checks selected secret markers and local documentation links; it is not a comprehensive secret scanner or license audit. Ignore rules do not remove files already committed or rewrite history. Follow [the launch checklist](OPEN-SOURCE-LAUNCH.md) before changing repository visibility or publishing artifacts.
