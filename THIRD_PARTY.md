# Third-party software

All application branding, interface and application code are original. Runtime libraries are installed dependencies, not product assets. React, Zustand, Tauri, portable-pty and xterm.js retain their upstream licenses in their respective distributions.

This restricted host has no Rust toolchain or external package download access. Frontend tools were installed from its existing npm cache. Unmodified MIT-licensed xterm.js and WebGL addon runtime distributions already installed on this machine were copied **only into ignored `node_modules`** for local frontend verification. No code or assets from their host applications are included in this repository.

The matching xterm prereleases available locally are pinned (`5.6.0-beta.136` and addon `0.19.0-beta.136`). Their lock entries use upstream npm URLs; integrity is not fabricated for offline copies. A clean online `npm ci` and upgrade to a mutually compatible stable xterm release must be verified before release. Normal installations use upstream typings. The stripped local runtime distributions omit those files, so this session placed the small public contracts in `scripts/offline-xterm-types.d.ts` into ignored `node_modules` for local verification only; that fallback is outside the application's TypeScript include path. Native release acceptance remains blocked, as documented in `docs/VERIFICATION.md`.
