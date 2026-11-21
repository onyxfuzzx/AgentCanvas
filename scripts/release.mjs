import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { thirdPartyLicenses } from './licenses.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const desktop = json('src-tauri/tauri.conf.json');
const extension = json('extension/package.json');
const product = json('product.json');
const args = process.argv.slice(2);
const stageOnly = args.includes('--stage-only');
const tag =
  args.find((arg) => !arg.startsWith('--')) || `v${desktop.version}-preview.1`;
if (
  process.platform !== 'win32' ||
  process.arch !== 'x64' ||
  args.some((arg) => arg.startsWith('--') && arg !== '--stage-only') ||
  !/^v\d+\.\d+\.\d+-(preview|alpha|beta|rc)\.\d+$/.test(tag) ||
  !tag.startsWith(`v${desktop.version}-`)
)
  throw new Error(
    'Use Windows x64 and a tag such as v0.1.0-preview.1 matching the desktop version.',
  );
if (process.env.AGENTCANVAS_BUILD_TAG)
  throw new Error(
    'Unset AGENTCANVAS_BUILD_TAG to stage the standard release outputs.',
  );

const run = (program, parameters, capture = false) => {
  const result = spawnSync(program, parameters, {
    cwd: root,
    shell: false,
    windowsHide: true,
    ...(capture ? { encoding: 'utf8' } : { stdio: 'inherit' }),
  });
  if (result.error || result.status !== 0)
    throw new Error(
      result.error?.message || `${program} failed (${result.status}).`,
    );
  return capture ? result.stdout.trim() : undefined;
};
if (run('git', ['status', '--porcelain'], true))
  throw new Error('Commit source changes before preparing release assets.');
const commit = run('git', ['rev-parse', 'HEAD'], true);
const output = resolve(root, 'artifacts', `release-${tag}`);
if (existsSync(output))
  throw new Error(
    `Release folder already exists: ${output}. Preserve it and use a new preview tag.`,
  );
if (!stageOnly) {
  run(process.execPath, [
    'scripts/desktop.mjs',
    'build',
    '--bundles',
    'nsis,msi',
  ]);
  run(process.execPath, ['scripts/extension.mjs', '--package']);
}

const digest = (path) =>
  createHash('sha256').update(readFileSync(path)).digest('hex');
const verifyInventory = (folder, required) => {
  const manifest = json(`${folder}/manifest.json`);
  if (
    manifest.version !== desktop.version ||
    manifest.profile !== 'release' ||
    manifest.architecture !== 'x64'
  )
    throw new Error(`Unexpected build metadata: ${folder}`);
  for (const name of required) {
    const entry = manifest.files.find((file) => file.name === name);
    if (!entry || digest(resolve(root, folder, name)) !== entry.sha256)
      throw new Error(`Missing or changed artifact: ${folder}/${name}`);
  }
};
const setup = `${product.name}_${desktop.version}_x64-setup.exe`;
const msi = `${product.name}_${desktop.version}_x64_en-US.msi`;
const vsix = `agentcanvas-${extension.version}-win32-x64.vsix`;
verifyInventory('artifacts/windows-installers', [setup, msi]);
verifyInventory('artifacts/windows-portable', [
  'agent-canvas-desktop.exe',
  'pty-host.exe',
  'agentcanvas-peer.exe',
  'LICENSE.txt',
  'THIRD_PARTY.md',
  ...Object.keys(thirdPartyLicenses).map((name) => `LICENSE-${name}.txt`),
]);
for (const name of ['windows-portable.zip', vsix]) {
  const path = resolve(root, 'artifacts', name);
  const expected = `${digest(path)}  ${name}`;
  if (readFileSync(`${path}.sha256`, 'utf8').trim() !== expected)
    throw new Error(`Checksum sidecar does not match ${name}`);
}

// Publish the complete local set atomically; never scoop old VSIX files into it.
const temporary = resolve(root, 'artifacts', `.release-${randomUUID()}`);
mkdirSync(temporary, { recursive: true });
const sources = [
  [`artifacts/windows-installers/${setup}`, setup],
  [`artifacts/windows-installers/${msi}`, msi],
  [
    'artifacts/windows-portable.zip',
    `${product.name}_${desktop.version}_windows-x64-portable.zip`,
  ],
  [`artifacts/${vsix}`, vsix],
  ['LICENSE', 'LICENSE.txt'],
  ['THIRD_PARTY.md', 'THIRD_PARTY.md'],
];
for (const [source, name] of sources)
  copyFileSync(resolve(root, source), resolve(temporary, name));
const notes = `# ${product.name} ${tag} — Windows preview\n\nSource commit: ${commit}\n\nDesktop: ${desktop.version}. Extension: ${extension.version}. Windows x64 only; unsigned preview candidates.\n\n## Downloads\n\n- \`${setup}\`: per-user desktop setup (recommended).\n- \`${msi}\`: alternative Windows Installer package; use one desktop installer.\n- \`${product.name}_${desktop.version}_windows-x64-portable.zip\`: extract the entire folder and run agent-canvas-desktop.exe; keep both helpers beside it.\n- \`${vsix}\`: the same extension package installs in VS Code and Antigravity via **Extensions: Install from VSIX...**. Open a trusted local project, then **AgentCanvas: Open Canvas**.\n\nDesktop requires the Microsoft Edge WebView2 Evergreen Runtime, installed separately. Installed desktop/extension packages need no Rust or Node.js toolchain. Provider CLIs are optional and installed/authenticated separately. The desktop setup includes both native helpers and project/JavaScript license notices.\n\n## Preview limits\n\nBuild and smoke evidence is recorded in docs/VERIFICATION.md. Clean-machine Windows 10/11 install, upgrade, uninstall/data preservation, DPI/accessibility, complete third-party license review and full authenticated provider workflows remain qualification gates. These candidates do not establish a stable support promise. No marketplace publication or automatic updater is included.\n\nCompare downloads with SHA256SUMS.txt using PowerShell Get-FileHash -Algorithm SHA256. Review the recorded evidence and outstanding release gates before publishing this as a prerelease.\n`;
writeFileSync(resolve(temporary, 'RELEASE-NOTES.md'), notes);
const inventory = sources.map(([, name]) => ({
  name,
  bytes: readFileSync(resolve(temporary, name)).length,
  sha256: digest(resolve(temporary, name)),
}));
writeFileSync(
  resolve(temporary, 'manifest.json'),
  JSON.stringify(
    {
      product: product.name,
      tag,
      sourceCommit: commit,
      desktopVersion: desktop.version,
      extensionVersion: extension.version,
      platform: 'windows-x64',
      signed: false,
      files: inventory,
    },
    null,
    2,
  ) + '\n',
);
const checksumFiles = [
  ...sources.map(([, name]) => name),
  'RELEASE-NOTES.md',
  'manifest.json',
];
writeFileSync(
  resolve(temporary, 'SHA256SUMS.txt'),
  checksumFiles
    .map((name) => `${digest(resolve(temporary, name))}  ${basename(name)}`)
    .join('\n') + '\n',
);
renameSync(temporary, output);
console.log(
  `Release candidates: ${output}\nSource: ${commit}\nNo GitHub release was created or published.`,
);
