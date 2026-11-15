# AgentCanvas UI release candidate

Version: 0.1.0. Includes the icon refinement of source `17abdedf83a3cd9f3fe6294dbb01d4cb58beb24b`; see `VERIFICATION.md` for the icon milestone.

This candidate contains the M0–M11 implementation and the reference UI redesign. M12 features are not included.

## Packages

- Portable ZIP: `artifacts/windows-portable-ui-icons-final.zip`. Extract the whole folder before launching `agent-canvas-desktop.exe`; keep `pty-host.exe` and `agentcanvas-peer.exe` alongside it.
- Current-user installer: `artifacts/windows-installers-ui-icons-final/AgentCanvas_0.1.0_x64-setup.exe`.
- MSI: `artifacts/windows-installers-ui-icons-final/AgentCanvas_0.1.0_x64_en-US.msi`.
- Checksums: the ZIP's `.sha256` file and each package folder's `manifest.json` / `SHA256SUMS.txt`.

The target is Windows 10 22H2 / Windows 11 x64 with the Microsoft Edge WebView2 Evergreen Runtime already installed. These packages are unsigned. Building packages does not establish installer upgrade/uninstall behavior.

## UI acceptance evidence

| Check                                      | Evidence                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Reference geometry, palette and typography | Source comparison with the supplied `AgentCanvas.html`                                      |
| All eight workspace pages                  | Native inspection at the minimum window size                                                |
| Light and dark appearance                  | Native canvas/Review inspection; the full theme-by-page matrix is not claimed               |
| Task board overflow                        | Native scrolling reached Done at minimum size                                               |
| Palette and shortcuts                      | Twelve Down presses plus Enter opened shortcuts; Escape closed the dialog                   |
| Notes                                      | Fresh creation, native workspace save and saved 320×200 geometry verified                   |
| Review                                     | Binary/Unicode files, stale evidence, three large-diff pages and source line 1,200 verified |
| Diff page scroll reset                     | Rebuilt native app moved from scrolled page one to the start of page two                    |
| Exact reference screenshot parity          | Not verified; a supported reference browser was unavailable                                 |
| Windows 125%, 150%, 200% scaling           | Not verified; automatic approval review rejected access to Windows Display Settings         |

The native observations above are recorded in `VERIFICATION.md`. No OS display settings were changed.

## Release verification

The `ui-icons-final` package hashes, ZIP checksum/CRC, extracted-file comparisons and embedded frontend asset names passed. The MSI database confirmed the app and both helpers are packaged together. Native verification of the final extracted icon build confirmed the Team control's people icon, label and page-opening action, then normal close. The earlier `ui-release-final` optimized build passed direct terminal input/output, Canvas → Notes → Canvas continuity and app/helper/cmd process shutdown checks.

The completed commands and observed outcomes are recorded in `VERIFICATION.md`. Installers were inspected without installation; upgrade, repair and uninstall remain unverified. The latest full frontend check for the packaged source passed 86 tests; packaging repeated TypeScript and the production frontend build.
