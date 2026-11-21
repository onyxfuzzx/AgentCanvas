# Windows release preparation

The desktop setup EXE, MSI and portable ZIP are alternatives. A single Windows x64 VSIX supports both local VS Code and compatible Antigravity builds. Desktop and extension versions are independent: the current desktop is 0.1.0 and the extension is 0.1.6. Keep earlier candidate files intact when incrementing versions.

## Build and verify

Use the [Windows development prerequisites](DEVELOPMENT.md). Commit source changes first so the candidate manifest identifies reviewable source. Run the required checks and limited publication audit:

```powershell
npm run native:check
npm run extension:build
npm run check
npm run repo:audit -- --history --public
npm run release:prepare
```

`release:prepare` rebuilds optimized desktop helpers, desktop/NSIS/MSI and the editor/backend VSIX. It verifies the portable/installer inventories and ZIP/VSIX checksum sidecars, then stages only the selected versions under `artifacts/release-v0.1.0-preview.1/`. The folder includes installers, portable ZIP, VSIX, project license/provenance, release notes, source/version manifest and aggregate SHA-256 checksums. Generated binaries stay ignored; never commit them.

The desktop installer includes `pty-host.exe` and `agentcanvas-peer.exe` beside the app through Tauri's additional Cargo binary packaging. Do not also map these helpers as resources: that creates duplicate MSI components. Tauri's [resource mapping](https://v2.tauri.app/develop/resources/) supplies the project license, provenance and JavaScript runtime notice files. Desktop portable archives include the same required helpers and notices. The installer skips WebView2 provisioning: users must already have the Evergreen Runtime or install it separately. Complete transitive dependency notice review remains a publication gate.

For a packaging-only correction after a successful optimized runtime build, `npm run desktop:bundle` regenerates installers and portable output without recompiling Rust. It requires the already-built application and helpers from the same runtime source. Use `release:prepare` for a full rebuild; bundle-only mode does not prove compilation or freshness.

The staging command refuses an existing destination; preserve previous candidates and select a new matching tag, for example `npm run release:prepare -- v0.1.0-preview.2`. It also refuses dirty source and a desktop build-tag override. `npm run release:stage` collects already-built standard outputs for the CI workflow; it does not rebuild or prove freshness. Run it only immediately after building those outputs from the recorded commit. Do not mix artifacts from other source revisions.

The manual **Build preview candidates** workflow runs checks, builds the same files and uploads the staged folder as a GitHub Actions artifact. It has read-only repository permissions and does not create a GitHub release. Download and extract that artifact before uploading individual release assets.

## Inspect the actual packages

- Check all entries in `SHA256SUMS.txt` with `Get-FileHash -Algorithm SHA256`.
- Inspect/extract the MSI and VSIX. Verify the three native executables, JavaScript assets and license files against the build output. Launch a disposable installed/extracted desktop candidate and exercise native terminals; a successful compiler run alone cannot verify installed helper paths.
- Install the VSIX in disposable VS Code and Antigravity profiles, then open/save/close a canvas and check backend cleanup/recovery. Keep normal user profiles and workspaces separate.
- Record executed checks, OS/editor versions and limitations in [VERIFICATION.md](VERIFICATION.md). The existing editor runner uses a development extension path; it is not by itself proof of packaged VSIX installation.
- Complete the applicable [launch gates](OPEN-SOURCE-LAUNCH.md), including clean Windows install/upgrade/uninstall/data preservation, WebView2 behavior, dependency provenance, signing decision and provider/UI qualification. The history audit checks selected markers and links; it is not a comprehensive secret, personal-data or legal audit.

## Upload to GitHub Releases

Publication is a separate action from preparing these files. When publication is authorized and the intended preview gates are reviewed:

1. Choose the exact source commit recorded in the candidate manifest and create its matching preview tag. Do not tag an unrelated branch head.
2. Open the repository's **Releases → Draft a new release**, select that tag and use the generated `RELEASE-NOTES.md` as the description. Adjust the actual verification matrix and limitations from recorded evidence.
3. Upload the setup EXE, MSI, portable ZIP, VSIX, `SHA256SUMS.txt`, `manifest.json`, `LICENSE.txt` and `THIRD_PARTY.md` from the staged folder. The same VSIX serves both editors.
4. Mark **Set as a pre-release**. Review filenames, source commit and downloaded checksums before publishing.
5. Update the README's download versions for each release. Marketplace publication, code signing, automatic updates and repository settings have separate authorization and qualification.
