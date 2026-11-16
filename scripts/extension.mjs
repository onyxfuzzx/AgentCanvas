import { build } from 'esbuild';
import { build as buildWebview } from 'vite';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const extension = resolve(root, 'extension');
const product = JSON.parse(
  await readFile(resolve(root, 'product.json'), 'utf8'),
);
const debug = process.argv.includes('--debug');
const uiOnly = process.argv.includes('--ui-only');
if (uiOnly && process.argv.includes('--package'))
  throw new Error('Packaging requires a complete native build.');
const run = (program, args, cwd = root) => {
  const result = spawnSync(program, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      result.error?.message || `${program} failed (${result.status}).`,
    );
};
run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
run(process.execPath, [
  'node_modules/typescript/bin/tsc',
  '-p',
  'extension/tsconfig.json',
]);
await mkdir(resolve(extension, 'dist'), { recursive: true });
await build({
  entryPoints: [resolve(extension, 'src/extension.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['vscode'],
  outfile: resolve(extension, 'dist/extension.cjs'),
  sourcemap: false,
  define: { PRODUCT_NAME: JSON.stringify(product.name) },
});
if (process.argv.includes('--smoke-support')) {
  await mkdir(resolve(root, '.cache/extension-smoke'), { recursive: true });
  await build({
    entryPoints: [resolve(extension, 'src/host.ts')],
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    outfile: resolve(root, '.cache/extension-smoke/host.cjs'),
  });
}
await buildWebview({
  configFile: false,
  root,
  define: {
    __PRODUCT_NAME__: JSON.stringify(product.name),
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    outDir: resolve(extension, 'webview'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    lib: {
      entry: resolve(root, 'src/main.tsx'),
      formats: ['iife'],
      name: 'AgentCanvas',
      fileName: () => 'canvas.js',
      cssFileName: 'canvas',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
await writeFile(
  resolve(extension, 'package.nls.json'),
  JSON.stringify(
    {
      productName: product.name,
      openTitle: `${product.name}: Open Canvas`,
      saveTitle: `${product.name}: Save Workspace`,
      closeTitle: `${product.name}: Close Canvas`,
      selectProjectTitle: `${product.name}: Choose Project Folder`,
    },
    null,
    2,
  ) + '\n',
);
await copyFile(
  resolve(root, 'THIRD_PARTY.md'),
  resolve(extension, 'THIRD_PARTY.md'),
);
if (process.platform !== 'win32' || process.arch !== 'x64')
  throw new Error('The bundled native backend currently targets Windows x64.');
if (!uiOnly) {
  run('cargo', [
    'build',
    '--locked',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    '--bin',
    'agentcanvas-editor',
    '--bin',
    'pty-host',
    '--bin',
    'agentcanvas-peer',
    ...(debug ? [] : ['--release']),
  ]);
  await mkdir(resolve(extension, 'native'), { recursive: true });
  const target = resolve(
    process.env.CARGO_TARGET_DIR || resolve(root, 'src-tauri/target'),
    debug ? 'debug' : 'release',
  );
  for (const binary of [
    'agentcanvas-editor.exe',
    'pty-host.exe',
    'agentcanvas-peer.exe',
  ])
    await copyFile(
      resolve(target, binary),
      resolve(extension, 'native', binary),
    );
}
await mkdir(resolve(extension, 'media/licenses'), { recursive: true });
for (const [name, source] of Object.entries({
  react: 'react/LICENSE',
  'react-dom': 'react-dom/LICENSE',
  scheduler: 'scheduler/LICENSE',
  zustand: 'zustand/LICENSE',
  xterm: '@xterm/xterm/LICENSE',
  'xterm-webgl': '@xterm/addon-webgl/LICENSE',
})) {
  await copyFile(
    resolve(root, 'node_modules', source),
    resolve(extension, 'media/licenses', `${name}.txt`),
  );
}
if (process.argv.includes('--package')) {
  await mkdir(resolve(root, 'artifacts'), { recursive: true });
  const manifest = JSON.parse(
    await readFile(resolve(extension, 'package.json'), 'utf8'),
  );
  const name = `agentcanvas-${manifest.version}-win32-x64${debug ? '-debug' : ''}.vsix`;
  run(
    process.execPath,
    [
      resolve(root, 'node_modules/@vscode/vsce/vsce'),
      'package',
      '--no-dependencies',
      '--allow-missing-repository',
      '--skip-license',
      '--target',
      'win32-x64',
      '--out',
      resolve(root, 'artifacts', name),
    ],
    extension,
  );
  const digest = createHash('sha256')
    .update(await readFile(resolve(root, 'artifacts', name)))
    .digest('hex');
  await writeFile(
    resolve(root, 'artifacts', `${name}.sha256`),
    `${digest}  ${name}\n`,
  );
  console.log(`Packaged artifacts/${name}`);
}
