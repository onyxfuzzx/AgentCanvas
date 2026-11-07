import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const product = JSON.parse(
  readFileSync(new URL('../product.json', import.meta.url)),
);
const config = {
  productName: product.name,
  app: {
    windows: [
      {
        label: 'main',
        title: product.name,
        width: 1440,
        height: 920,
        minWidth: 900,
        minHeight: 600,
        decorations: false,
      },
    ],
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
    ...(process.argv[2] === 'build' ? ['--release'] : []),
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
    'src-tauri/tauri.generated.json',
  ],
  { stdio: 'inherit', shell: false },
);
if (result.error)
  console.error(
    'Rust and cargo-tauri are required. See README.md.',
    result.error.message,
  );
process.exit(result.status ?? 1);
