# Third-party software and provenance

AgentCanvas project source is [MIT-licensed](LICENSE). Dependencies retain their own licenses; the project license does not relicense upstream software. Provider CLIs are installed separately and are not bundled. Read each provider's terms and data policies independently.

## Dependency sources

- JavaScript dependencies and exact versions are recorded in `package.json` and `package-lock.json`. React/React DOM, Zustand and xterm runtimes retain their upstream license notices. The extension packaging script copies the existing local license files into its generated payload.
- Rust dependencies and exact versions are recorded in `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`, including Tauri, portable-pty, Serde, RustCrypto `sha2` and Windows bindings. Review their actual license metadata and redistribution notices for a release; this summary is not a complete transitive notice inventory.
- The project license and this provenance document are included in portable desktop output and the extension package. Complete required third-party notices and installer notice presentation are explicit OS1 release gates.

## Historical offline bootstrap constraint

The initial restricted development environment used locally available, unmodified MIT-licensed xterm.js/WebGL runtime distributions **only in ignored `node_modules`**. No host-product code or branding was added to source. A small public-contract typing fallback, `scripts/offline-xterm-types.d.ts`, was used only for that local verification and is outside the application's TypeScript include path.

The npm dependency update replaces the historical xterm prereleases (`5.6.0-beta.136` and addon `0.19.0-beta.136`) with published stable xterm 6.0.0 and WebGL addon 0.19.0. Lock entries use upstream npm URLs and registry integrity metadata. Clean `npm ci`, upstream type checks and terminal tests are recorded in [VERIFICATION.md](docs/VERIFICATION.md); broader clean-machine and host rendering checks remain release gates. Do not reproduce the offline copy workaround as contributor setup or claim that cached builds alone establish fresh-install reproducibility.

Rust/native builds and tests have since executed successfully; the original absence of a Rust toolchain is historical, not the current status. See [executed verification](docs/VERIFICATION.md), [current release work](docs/PROJECT-STATUS.md) and [the launch checklist](docs/OPEN-SOURCE-LAUNCH.md).
