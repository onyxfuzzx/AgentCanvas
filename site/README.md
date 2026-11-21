# AgentCanvas project website

A static product page for GitHub Pages. The workspace is a labeled, browser-only illustration; it does not start providers or connect to the desktop app. Copy describes implemented features and the Windows preview. There are no analytics, external fonts, runtime libraries, API calls or download claims.

## Build and preview

Run these commands from the repository root with Node.js 22 or newer:

```powershell
npm run site:check
npm run site:build
npm run site:preview
```

These commands use Node built-ins; the desktop dependencies and Rust toolchain are unnecessary. Preview opens at `http://127.0.0.1:4174/AgentCanvas/`. The server reads source files on refresh and exposes only the six declared public files. It does not expose the repository or local workspaces. Stop it with Ctrl+C.

The build writes seven files, including `.nojekyll`, to `.cache/site-dist/`. It renders the product name from `product.json`, validates local references and anchors, rejects symlinks and unexpected output files, then copies the declared assets. No repository-wide copy is used. Unexpected output files are preserved and block the build; inspect them rather than deleting unknown data automatically. Preview the actual artifact with `npm run site:preview -- --built --port 4175`.

`site/index.html` is the source template. Preview it through the server, or open the generated `.cache/site-dist/index.html` after a build. The `__PRODUCT_NAME__` token is HTML-escaped during rendering. Repository/clone URLs remain explicit and independent of the display name. If rebranding, update the curated social artwork as well.

## GitHub Pages deployment

The configured target is **https://onyxfuzzx.github.io/AgentCanvas/**. This is the intended address, not a claim that the site has been published.

1. Push the site and `.github/workflows/pages.yml` to the GitHub repository. Repository visibility remains a separate owner decision; keep the public-source gates in [the launch runbook](../docs/OPEN-SOURCE-LAUNCH.md).
2. In the repository, select **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Push a relevant change to the default branch, or run **Actions → Project website → Run workflow** from that branch.
4. Confirm that both jobs succeed and open the URL reported by **Deploy to GitHub Pages**. Set the repository's About/Website field only after that live check.

Pull requests and other branches build the site but cannot run the deploy job. Deployment uses the `github-pages` environment and grants Pages/OIDC write permission only to that job. The workflow follows [GitHub's custom Pages workflow guidance](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages). It installs no npm dependencies and does not build the native app.

For a fork, update the repository links and canonical/Open Graph URLs in the template. Asset paths are relative, so the built page works under a project subpath or at a domain root. Test another preview base with `npm run site:preview -- --base / --port 4175`.

## Browser verification

The optional browser check uses isolated test tools and an installed Chrome, separately from application dependencies:

```powershell
npm install --prefix .tools/site-qa --no-save --package-lock=false --ignore-scripts playwright@1.65.1 @axe-core/playwright@4.14.0
npm run site:preview
```

In another terminal:

```powershell
npm run site:browser-check
```

On a Windows machine with Edge, set `$env:SITE_BROWSER_CHANNEL='msedge'` before the check. The script accepts only a local preview URL. It checks project-subpath assets, file refusal, stage controls, pointer and keyboard window movement, layout reset, setup target switching, copy success/refusal through a stubbed clipboard, responsive overflow, reduced motion, larger text, JavaScript-disabled setup and automated accessibility. It never reads or overwrites the system clipboard.

Set `$env:SITE_PREVIEW_URL='http://127.0.0.1:4175/AgentCanvas/'` to check the built preview instead. Screenshots and structured results go to ignored `.cache/site-qa/`. An automated accessibility pass is limited to the checked rules and viewports; it does not establish complete screen-reader or platform compatibility.

The social image is original SVG artwork plus its committed 1200×630 PNG export. After editing `assets/social.svg`, regenerate the PNG through the same browser tooling:

```powershell
npm run site:browser-check -- --render-social
```

Inspect the screenshots before committing. Keep app screenshots and recordings separate from the illustration, and review them for private paths, accounts and transcripts before publication.
