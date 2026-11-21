import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const product = JSON.parse(
  readFileSync(new URL('../product.json', import.meta.url)),
);
const buildTag = process.env.AGENTCANVAS_BUILD_TAG || '';
if (buildTag && !/^[a-z0-9-]{1,32}$/.test(buildTag))
  throw new Error(
    'AGENTCANVAS_BUILD_TAG must contain lowercase letters, digits or hyphens.',
  );
const baseConfig = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url)),
);
const debug = process.argv.includes('--debug');
const profile = debug ? 'debug' : 'release';
const helpers = ['pty-host.exe', 'agentcanvas-peer.exe'];
const config = {
  productName: product.name,
  app: {
    windows: baseConfig.app.windows.map((window) => ({
      ...window,
      title: product.name,
    })),
  },
};
writeFileSync(
  new URL('../src-tauri/tauri.generated.json', import.meta.url),
  JSON.stringify(config),
);
const helper = spawnSync(
  'cargo',
  [
    'build',
    '--locked',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--bin',
    'pty-host',
    '--bin',
    'agentcanvas-peer',
    ...(process.argv[2] === 'build' && !process.argv.includes('--debug')
      ? ['--release']
      : []),
  ],
  { stdio: 'inherit', shell: false },
);
if (helper.status !== 0) {
  console.error(
    helper.error?.message || 'Could not build the PTY host. See README.md.',
  );
  process.exit(helper.status ?? 1);
}
// Prefer the locally installed official CLI when available on restricted hosts.
const localCli = new URL(
  '../.tools/tauri/node_modules/@tauri-apps/cli/tauri.js',
  import.meta.url,
);
const result = spawnSync(
  existsSync(localCli) ? process.execPath : 'cargo',
  [
    ...(existsSync(localCli) ? [fileURLToPath(localCli)] : ['tauri']),
    ...process.argv.slice(2),
    '--config',
    fileURLToPath(
      new URL('../src-tauri/tauri.generated.json', import.meta.url),
    ),
    ...(process.argv[2] === 'build' ? ['--', '--locked'] : []),
  ],
  { stdio: 'inherit', shell: false },
);
if (result.error)
  console.error(
    'Rust and cargo-tauri are required. See README.md.',
    result.error.message,
  );
if (result.status === 0 && process.argv[2] === 'build') {
  const target = pathToFileURL(
    resolve(
      process.env.CARGO_TARGET_DIR ||
        fileURLToPath(new URL('../src-tauri/target/', import.meta.url)),
      profile,
    ) + sep,
  );
  const output = new URL(
    `../artifacts/windows-${debug ? 'debug' : 'portable'}${buildTag ? `-${buildTag}` : ''}/`,
    import.meta.url,
  );
  mkdirSync(output, { recursive: true });
  for (const file of ['agent-canvas-desktop.exe', ...helpers])
    copyFileSync(new URL(file, target), new URL(file, output));
  copyFileSync(
    new URL('../LICENSE', import.meta.url),
    new URL('LICENSE.txt', output),
  );
  copyFileSync(
    new URL('../THIRD_PARTY.md', import.meta.url),
    new URL('THIRD_PARTY.md', output),
  );
  writeFileSync(
    new URL('README.txt', output),
    `${product.name}\n\nRun agent-canvas-desktop.exe. Keep both helper executables alongside it.\nRequires Windows 10 22H2 / Windows 11 x64 and the Microsoft Edge WebView2 Evergreen Runtime.\nWorkspaces autosave layout and notes; terminal output, commands, activity summaries, tokens and message logs stay in memory.\nBrowser nodes restore paused. Use Open to load a page; Stop releases it. Up to eight pages can be live.\nActivity summaries use local output heuristics. Quiet output does not prove a task is idle; labels can be overridden.\nTheme and keyboard controls are in the sidebar and shortcuts dialog.\n`,
  );
  const manifest = (folder) => {
    const files = readdirSync(folder).filter(
      (name) => !['manifest.json', 'SHA256SUMS.txt'].includes(name),
    );
    const entries = files.map((name) => ({
      name,
      sha256: createHash('sha256')
        .update(readFileSync(new URL(name, folder)))
        .digest('hex'),
    }));
    writeFileSync(
      new URL('manifest.json', folder),
      JSON.stringify(
        {
          product: product.name,
          version: baseConfig.version,
          profile,
          architecture: process.arch,
          files: entries,
        },
        null,
        2,
      ) + '\n',
    );
    writeFileSync(
      new URL('SHA256SUMS.txt', folder),
      entries.map((e) => `${e.sha256}  ${e.name}`).join('\n') + '\n',
    );
  };
  manifest(output);
  if (!debug && process.platform === 'win32') {
    const zip = new URL(
      `../artifacts/${basename(fileURLToPath(output))}.zip`,
      import.meta.url,
    );
    const temporaryZip = new URL(
      `../artifacts/.portable-${randomUUID()}.partial.zip`,
      import.meta.url,
    );
    const archived = spawnSync(
      'tar.exe',
      [
        '-a',
        '-c',
        '-f',
        fileURLToPath(temporaryZip),
        '-C',
        dirname(fileURLToPath(output)),
        basename(fileURLToPath(output)),
      ],
      { stdio: 'inherit', shell: false },
    );
    if (archived.status !== 0) process.exit(archived.status ?? 1);
    renameSync(temporaryZip, zip);
    writeFileSync(
      new URL(
        `${basename(fileURLToPath(zip))}.sha256`,
        new URL('../artifacts/', import.meta.url),
      ),
      `${createHash('sha256').update(readFileSync(zip)).digest('hex')}  ${basename(fileURLToPath(zip))}\n`,
    );
  }
  if (!process.argv.includes('--no-bundle')) {
    const installers = new URL(
      `../artifacts/windows-installers${buildTag ? `-${buildTag}` : ''}/`,
      import.meta.url,
    );
    mkdirSync(installers, { recursive: true });
    for (const [kind, extension] of [
      ['nsis', '.exe'],
      ['msi', '.msi'],
    ]) {
      const source = new URL(`bundle/${kind}/`, target);
      const files = readdirSync(source).filter(
        (f) =>
          f.startsWith(`${product.name}_${baseConfig.version}_`) &&
          f.endsWith(extension),
      );
      if (!files.length) throw new Error(`Missing ${kind} installer`);
      for (const file of files)
        copyFileSync(new URL(file, source), new URL(file, installers));
    }
    manifest(installers);
    console.log(`Installers: ${fileURLToPath(installers)}`);
  }
  console.log(`Portable folder: ${fileURLToPath(output)}`);
}
process.exit(result.status ?? 1);
