// Read-only source/history checks. Reports locations, never matching secret values.
import { spawnSync } from 'node:child_process';
import { readFile, stat, access } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute } from 'node:path';

const root = process.cwd();
const errors = [],
  warnings = [];
function git(args, allowed = [0]) {
  const r = spawnSync('git', args, {
    encoding: 'utf8',
    shell: false,
    timeout: 30000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (r.error || !allowed.includes(r.status))
    throw new Error(
      `Git audit command failed: ${r.error?.message || r.status}`,
    );
  return r.stdout;
}
const files = [
  ...new Set(
    git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
      .split('\0')
      .filter(Boolean),
  ),
];
const generated =
  /(^|\/)(node_modules|target|dist|artifacts|\.cache|\.tools|\.local|\.aws|\.ssh|\.codex|\.claude|\.gemini|recovery|task-areas)(\/|$)|(^|\/)\.env($|\.(?!example$|sample$|template$))|(^|\/)\.npmrc$|\.(exe|dll|pdb|msi|msix|vsix|zip|pem|key|pfx|p12|keystore|dmp|log)$/i;
const markers = [
  ['private key', /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['AWS access key', /\b(AKIA|ASIA)[A-Z0-9]{16}\b/],
  [
    'GitHub token',
    /\bgh[pousr]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  ],
  ['provider key', /\bsk-(proj-|ant-api[0-9]+-)?[A-Za-z0-9_-]{32,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/],
];
let textFiles = 0,
  localLinks = 0;
for (const file of files) {
  let info;
  try {
    info = await stat(file);
  } catch (e) {
    if (e.code === 'ENOENT') continue;
    throw e;
  }
  if (generated.test(file))
    errors.push(
      `Private/generated file in source inventory: ${JSON.stringify(file)}`,
    );
  if (
    !info.isFile() ||
    info.size > 2 * 1024 * 1024 ||
    /\.(png|gif|ico)$/i.test(file)
  )
    continue;
  const content = await readFile(file, 'utf8');
  if (content.includes('\0')) continue;
  textFiles++;
  for (const [name, pattern] of markers)
    if (pattern.test(content))
      errors.push(`Possible ${name}: ${JSON.stringify(file)} (value omitted)`);
  if (!file.endsWith('.md')) continue;
  const markdown = content.replace(/```[\s\S]*?```/g, '');
  const destinations = [
    ...markdown.matchAll(/!?\[[^\]\n]*\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g),
  ].map((m) => m[1]);
  destinations.push(
    ...[...markdown.matchAll(/(?:src|href)="([^"#]+)"/g)].map((m) => m[1]),
  );
  for (const link of destinations) {
    if (/^(#|[a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) continue;
    const path = decodeURIComponent(link.split('#')[0]);
    if (!path) continue;
    const target = resolve(dirname(file), path),
      within = relative(root, target);
    if (
      isAbsolute(within) ||
      within === '..' ||
      within.startsWith('../') ||
      within.startsWith('..\\')
    ) {
      errors.push(
        `Documentation link leaves repository: ${JSON.stringify(file)} -> ${JSON.stringify(link)}`,
      );
      continue;
    }
    localLinks++;
    try {
      await access(target);
    } catch {
      errors.push(
        `Missing documentation target: ${JSON.stringify(file)} -> ${JSON.stringify(link)}`,
      );
    }
  }
}
// Probe behavior without creating credential or workspace files on disk.
for (const path of [
  '.env',
  '.env.local',
  '.aws/credentials',
  '.codex/auth.json',
  'signing.key',
  'workspaces/demo/workspace.json',
  'recovery/drafts-demo.json',
  'artifacts/preview.exe',
  'extension/native/agentcanvas-editor.exe',
]) {
  if (!git(['check-ignore', '--no-index', path], [0, 1]).trim())
    errors.push(`Ignore rule missing: ${path}`);
}
for (const path of [
  'README.md',
  'AGENTS.md',
  'package-lock.json',
  'src-tauri/Cargo.lock',
  'examples/team-plan.json',
  '.env.example',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
]) {
  if (git(['check-ignore', '--no-index', path], [0, 1]).trim())
    errors.push(`Public source unexpectedly ignored: ${path}`);
}
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
let licensed = false;
try {
  licensed =
    Boolean((await readFile('LICENSE', 'utf8')).trim()) &&
    Boolean(pkg.license) &&
    pkg.license !== 'UNLICENSED';
} catch {
  /* A pending license is a publication gate. */
}
if (!licensed)
  (process.argv.includes('--public') ? errors : warnings).push(
    'An approved LICENSE and matching package metadata are required before open-source publication.',
  );
if (licensed) {
  const extension = JSON.parse(
    await readFile('extension/package.json', 'utf8'),
  );
  const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const cargo = await readFile('src-tauri/Cargo.toml', 'utf8');
  if (
    extension.license !== pkg.license ||
    lock.packages[''].license !== pkg.license ||
    !cargo.includes(`license = "${pkg.license}"`)
  )
    errors.push(
      'Project license metadata differs between npm, lockfile, extension and Cargo manifests.',
    );
}
if (process.argv.includes('--history')) {
  const pattern =
    '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|(AKIA|ASIA)[A-Z0-9]{16}|gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}|sk-(proj-|ant-api[0-9]+-)?[A-Za-z0-9_-]{32,}|xox[baprs]-[A-Za-z0-9-]{20,}';
  const commits = git(['rev-list', '--all']).trim().split('\n').filter(Boolean);
  for (const commit of commits) {
    const matches = git(
      ['grep', '-I', '-l', '-E', '-e', pattern, commit, '--'],
      [0, 1],
    ).trim();
    if (matches)
      for (const path of matches.split('\n'))
        errors.push(
          `Possible historical secret marker: ${JSON.stringify(path)} (value omitted)`,
        );
  }
  const identities = new Set(
    git(['log', '--all', '--format=%ae']).trim().split('\n').filter(Boolean),
  );
  console.log(
    `History: ${commits.length} commits checked for recognized key markers; ${identities.size} author email identities remain in commit metadata. Review them before publication.`,
  );
}
for (const message of warnings) console.warn(`REVIEW: ${message}`);
for (const message of errors) console.error(`FAIL: ${message}`);
console.log(
  `Repository audit: ${textFiles} text files, ${localLinks} local documentation links, ${errors.length} failures.`,
);
console.log(
  'This checks a limited set of markers; it is not proof that all secrets, personal data or license obligations have been identified. No history was rewritten.',
);
if (errors.length) process.exitCode = 1;
