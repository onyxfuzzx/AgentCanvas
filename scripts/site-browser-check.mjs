// Optional browser QA; see site/README.md for the isolated test-tool install.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const require = createRequire(resolve('.tools/site-qa/package.json'));
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const url = new URL(
  process.env.SITE_PREVIEW_URL ?? 'http://127.0.0.1:4174/AgentCanvas/',
);
assert(
  ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname),
  'Run browser QA against a local preview.',
);
const folder = resolve('.cache/site-qa');
await mkdir(folder, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.SITE_BROWSER_CHANNEL ?? 'chrome',
  headless: true,
});
const result = {
  targetBase: url.origin + url.pathname,
  checks: [],
  responsive: [],
  accessibility: [],
  errors: [],
  externalRequests: [],
};
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: 'light',
  });
  const page = await context.newPage();
  if (process.argv.includes('--render-social')) {
    const image = await context.newPage();
    await image.setViewportSize({ width: 1200, height: 630 });
    await image.goto(new URL('assets/social.svg', url).href);
    await image.screenshot({ path: resolve('site/assets/social.png') });
    await image.close();
  }
  page.on('pageerror', (error) => result.errors.push(error.message));
  page.on('request', (request) => {
    if (!request.url().startsWith(url.origin))
      result.externalRequests.push(request.url());
  });
  const response = await page.goto(url.href, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  for (const file of [
    'styles.css',
    'site.js',
    'assets/mark.svg',
    'assets/social.png',
  ])
    assert.equal(
      (await page.request.get(new URL(file, url).href)).status(),
      200,
    );
  assert.equal(
    (await page.request.get(new URL('.env', url).href)).status(),
    404,
  );
  assert.equal(
    (await page.request.get(new URL('../package.json', url).href)).status(),
    404,
  );
  result.checks.push('project-subpath-assets-and-private-file-refusal');
  for (const stage of ['build', 'review', 'plan']) {
    await page.locator(`button[data-stage="${stage}"]`).click();
    assert.equal(
      await page.locator('.canvas-viewport').getAttribute('data-stage'),
      stage,
    );
    assert.equal(
      await page
        .locator(`button[data-stage="${stage}"]`)
        .getAttribute('aria-pressed'),
      'true',
    );
  }
  const handle = page.getByRole('button', {
    name: 'Move Codex window',
    exact: true,
  });
  await handle.scrollIntoViewIfNeeded();
  const card = page.locator('[data-node="codex"]');
  const initial = await card.evaluate((el) => ({
    x: el.offsetLeft,
    y: el.offsetTop,
  }));
  const pathBefore = await page
    .locator('[data-connection="codex"]')
    .getAttribute('d');
  const box = await handle.boundingBox();
  await page.mouse.move(box.x + 80, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y - 10, { steps: 10 });
  await page.mouse.up();
  assert((await card.evaluate((el) => el.offsetLeft)) > initial.x + 40);
  assert.notEqual(
    await page.locator('[data-connection="codex"]').getAttribute('d'),
    pathBefore,
  );
  await page
    .getByRole('button', { name: 'Reset preview window positions' })
    .click();
  assert.equal(await card.evaluate((el) => el.offsetLeft), initial.x);
  await handle.focus();
  await handle.press('ArrowRight');
  assert.equal(await card.evaluate((el) => el.offsetLeft), initial.x + 6);
  await handle.press('Shift+ArrowRight');
  assert.equal(await card.evaluate((el) => el.offsetLeft), initial.x + 26);
  await page
    .getByRole('button', { name: 'Reset preview window positions' })
    .click();
  result.checks.push(
    'stage-controls-pointer-drag-connected-lines-keyboard-move-and-reset',
  );
  const desktopCommands = await page.locator('#setup-code').textContent();
  await page.locator('[data-install="editor"]').click();
  const editorCommands = await page.locator('#setup-code').textContent();
  assert.notEqual(editorCommands, desktopCommands);
  assert(editorCommands.includes('npm run extension:package'));
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__copiedCommands = text;
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Copy setup commands' }).click();
  assert.equal(
    await page.evaluate(() => window.__copiedCommands),
    editorCommands,
  );
  await page.evaluate(() =>
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Test clipboard refusal');
        },
      },
    }),
  );
  await page.getByRole('button', { name: 'Copy setup commands' }).click();
  assert.equal(
    await page.evaluate(() => getSelection().toString()),
    editorCommands,
  );
  await page.evaluate(() => getSelection().removeAllRanges());
  await page.locator('[data-install="desktop"]').click();
  assert.equal(
    await page.locator('#setup-code').textContent(),
    desktopCommands,
  );
  result.checks.push(
    'setup-target-switch-copy-success-and-refused-clipboard-fallback',
  );
  for (const width of [320, 375, 390, 560, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    result.responsive.push({ width, horizontalOverflow: overflow });
    assert(!overflow, `Horizontal overflow at ${width}px`);
    if (width === 390 || width === 1440) {
      for (const stage of ['plan', 'build', 'review']) {
        await page.locator(`button[data-stage="${stage}"]`).click();
        if (width === 390)
          assert(
            await page
              .locator(
                `[data-node="${stage === 'plan' ? 'brief' : stage === 'build' ? 'codex' : 'antigravity'}"]`,
              )
              .isVisible(),
          );
      }
      await page.locator('button[data-stage="plan"]').click();
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();
      result.accessibility.push({
        width,
        violations: axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({
            target: n.target,
            summary: n.failureSummary,
          })),
        })),
      });
      await page.screenshot({
        path: resolve(folder, `${width === 390 ? 'mobile' : 'desktop'}.png`),
        fullPage: true,
      });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    ),
    'auto',
  );
  result.checks.push('reduced-motion');
  await page.setViewportSize({ width: 390, height: 844 });
  const normalText = await page
    .locator('.hero-aside > p:first-child')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  await page.addStyleTag({ content: ':root {font-size:200%}' });
  result.textResize = await page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  const enlargedText = await page
    .locator('.hero-aside > p:first-child')
    .evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  assert(
    enlargedText >= normalText * 2,
    'Body text must honor the root font preference.',
  );
  assert(
    result.textResize.scrollWidth <= result.textResize.width,
    'Overflow with 200% text size.',
  );
  const staticContext = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  const staticPage = await staticContext.newPage();
  await staticPage.goto(url.href);
  assert(await staticPage.locator('h1').isVisible());
  assert(
    (await staticPage.locator('#setup-code').textContent()).includes(
      'npm run desktop',
    ),
  );
  assert(!(await staticPage.locator('button[data-stage="plan"]').isVisible()));
  await staticContext.close();
  result.checks.push('200-percent-text-and-javascript-disabled-source-setup');
  assert.equal(result.errors.length, 0, 'Browser runtime errors');
  assert.equal(
    result.externalRequests.length,
    0,
    'Unexpected runtime network requests',
  );
  assert(
    result.accessibility.every((a) => a.violations.length === 0),
    'Accessibility violations; see .cache/site-qa/result.json',
  );
  result.outcome = 'passed';
} catch (error) {
  result.outcome = 'failed';
  result.reason = error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  await writeFile(
    resolve(folder, 'result.json'),
    JSON.stringify(result, null, 2),
  );
  console.log(JSON.stringify(result));
}
