import { createServer } from 'node:http';
import {
  access,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { resolve, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'site');
const output = join(root, '.cache', 'site-dist');
const product = JSON.parse(await readFile(join(root, 'product.json'), 'utf8'));
if (typeof product.name !== 'string' || !product.name.trim())
  throw new Error('product.json needs a product name.');
const brand = product.name.replace(
  /[&<>"']/g,
  (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
      character
    ],
);
const renderHtml = (html) => html.replaceAll('__PRODUCT_NAME__', brand);
const files = [
  'index.html',
  'styles.css',
  'site.js',
  'assets/mark.svg',
  'assets/social.png',
  'assets/social.svg',
];
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};
async function regular(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error('Site assets must be regular files: ' + path);
}
async function check() {
  await assertDirectory(source);
  await assertDirectory(join(source, 'assets'));
  for (const name of files) await regular(join(source, name));
  const html = await readFile(join(source, 'index.html'), 'utf8');
  const css = await readFile(join(source, 'styles.css'), 'utf8');
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, reference] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    if (/^https:\/\//.test(reference)) continue;
    if (reference.startsWith('#')) {
      if (reference.length > 1 && !ids.has(reference.slice(1)))
        throw new Error('Missing page anchor: ' + reference);
      continue;
    }
    if (!reference.startsWith('./') || !files.includes(reference.slice(2)))
      throw new Error('Unsupported or root-relative site asset: ' + reference);
    await access(join(source, reference));
  }
  if (
    /<script[^>]+src="https?:|<link[^>]+href="https?:[^>]+rel="stylesheet"/i.test(
      html,
    ) ||
    /@import|url\(\s*['"]?https?:/i.test(css)
  )
    throw new Error(
      'The site must not load runtime assets from external services.',
    );
  const syntax = spawnSync(
    process.execPath,
    ['--check', join(source, 'site.js')],
    { encoding: 'utf8', shell: false },
  );
  if (syntax.status !== 0)
    throw new Error(
      syntax.stderr ||
        syntax.error?.message ||
        'Site JavaScript syntax failed.',
    );
  console.log(
    `Site check passed: ${files.length} public files, relative assets and valid page anchors.`,
  );
}
async function assertDirectory(path) {
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error('Refusing symlinked site output: ' + path);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
async function build() {
  await check();
  for (const directory of [
    join(root, '.cache'),
    output,
    join(output, 'assets'),
  ])
    await assertDirectory(directory);
  await mkdir(join(output, 'assets'), { recursive: true });
  const allowed = new Set([...files, '.nojekyll']);
  async function inventory(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = prefix + entry.name;
      if (entry.isDirectory() && name === 'assets')
        await inventory(join(directory, entry.name), name + '/');
      else if (!entry.isFile() || !allowed.has(name))
        throw new Error(
          'Unexpected file in Pages output; preserved and not published: ' +
            name,
        );
    }
  }
  await inventory(output);
  for (const name of files) {
    if (name === 'index.html')
      await writeFile(
        join(output, name),
        renderHtml(await readFile(join(source, name), 'utf8')),
      );
    else await copyFile(join(source, name), join(output, name));
  }
  await writeFile(join(output, '.nojekyll'), '');
  console.log('GitHub Pages artifact: ' + output);
}
function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}
function serve() {
  const built = process.argv.includes('--built');
  const publicRoot = built ? output : source;
  const port = Number(option('--port', '4174'));
  const base = option('--base', '/AgentCanvas/');
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(base)
  )
    throw new Error(
      'Use a valid port and a slash-terminated base such as /AgentCanvas/.',
    );
  const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }
    let path;
    try {
      path = decodeURIComponent(
        new URL(request.url, 'http://localhost').pathname,
      );
    } catch {
      response.writeHead(400);
      response.end('Bad URL');
      return;
    }
    if (path === base.slice(0, -1) || (path === '/' && base !== '/')) {
      response.writeHead(308, { Location: base });
      response.end();
      return;
    }
    const name = path.startsWith(base)
      ? path.slice(base.length) || 'index.html'
      : '';
    if (!files.includes(name)) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    try {
      const original = await readFile(join(publicRoot, name));
      const data =
        name === 'index.html' && !built
          ? Buffer.from(renderHtml(original.toString('utf8')))
          : original;
      response.writeHead(200, {
        'Content-Type': mime[extname(name)],
        'Content-Length': data.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      response.end(request.method === 'HEAD' ? undefined : data);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  server.listen(port, '127.0.0.1', () =>
    console.log(`Local: http://127.0.0.1:${port}${base}`),
  );
  process.once('SIGINT', () => server.close(() => process.exit(0)));
  process.once('SIGTERM', () => server.close(() => process.exit(0)));
}
const command = process.argv[2] ?? 'check';
try {
  if (command === 'build') await build();
  else if (command === 'check') await check();
  else if (command === 'serve') serve();
  else throw new Error('Use check, build, or serve.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
