import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--bin',
    'pty-host',
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
const result = spawnSync(
  'cargo',
  [
    'tauri',
    ...process.argv.slice(2),
    '--config',
    fileURLToPath(
      new URL('../src-tauri/tauri.generated.json', import.meta.url),
    ),
  ],
  { stdio: 'inherit', shell: false },
);
if (result.error)
  console.error(
    'Rust and cargo-tauri are required. See README.md.',
    result.error.message,
  );
if (result.status === 0 && process.argv[2] === 'build') {
  const debug = process.argv.includes('--debug');
  const target = new URL(
    `../src-tauri/target/${debug ? 'debug' : 'release'}/`,
    import.meta.url,
  );
  const output = new URL(
    `../artifacts/windows-${debug ? 'debug' : 'portable'}${buildTag ? `-${buildTag}` : ''}/`,
    import.meta.url,
  );
  mkdirSync(output, { recursive: true });
  for (const file of ['agent-canvas-desktop.exe', 'pty-host.exe'])
    copyFileSync(new URL(file, target), new URL(file, output));
  writeFileSync(
    new URL('README.txt', output),
    `${product.name}\n\nRun agent-canvas-desktop.exe. Keep pty-host.exe beside it.\nWorkspaces autosave layout, whiteboard and terminal startup directories to workspace.json.\nMarkdown notes autosave to notes/<UUID>.md. Removing a note node keeps its file.\nTerminal commands and output are not restored. Use Manage workspaces to create or open a folder.\n`,
  );
  console.log(`Portable folder: ${fileURLToPath(output)}`);
}
process.exit(result.status ?? 1);
