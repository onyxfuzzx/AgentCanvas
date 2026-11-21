// Run only installed editors, using disposable profiles inside this repository.
import { spawn } from 'node:child_process';
import { mkdir, open, readFile, access, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const [selected = 'all', tag = 'restart'] = process.argv.slice(2);
if (process.platform !== 'win32' || !/^[a-z0-9-]{1,32}$/.test(tag))
  throw new Error('Use Windows and a lowercase test tag.');
const programs = {
  vscode: 'Microsoft VS Code/Code.exe',
  antigravity: 'Antigravity IDE/Antigravity IDE.exe',
};
if (selected !== 'all' && !Object.hasOwn(programs, selected))
  throw new Error('Choose vscode, antigravity or all.');
const base = resolve(root, '.cache/extension-smoke');
await mkdir(join(base, 'project-a'), { recursive: true });
await mkdir(join(base, 'project-b'), { recursive: true });
await writeFile(
  join(base, 'projects.code-workspace'),
  JSON.stringify({
    folders: [
      { name: 'Project A', path: 'project-a' },
      { name: 'Project B', path: 'project-b' },
    ],
    settings: {},
  }),
);
for (const editor of selected === 'all' ? Object.keys(programs) : [selected]) {
  const name = `${editor}-${tag}`,
    profile = join(base, name),
    result = join(base, `${name}-result.json`);
  try {
    await access(result);
    throw new Error(`Result already exists: ${result}. Choose a fresh tag.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const stdout = await open(join(base, `${name}.stdout.log`), 'wx');
  const stderr = await open(join(base, `${name}.stderr.log`), 'wx');
  const program = join(
    process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'),
    'Programs',
    programs[editor],
  );
  try {
    const env = {
      ...process.env,
      AGENTCANVAS_SMOKE_RESULT: result,
      AGENTCANVAS_SMOKE_STORAGE: join(
        profile,
        'User/globalStorage/agentcanvas-local.agentcanvas',
      ),
      AGENTCANVAS_SMOKE_SUPPORT: join(base, 'host.cjs'),
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(
      program,
      [
        '--new-window',
        '--disable-workspace-trust',
        '--disable-extensions',
        '--skip-welcome',
        '--skip-release-notes',
        '--user-data-dir',
        profile,
        '--extensions-dir',
        join(base, `${name}-extensions`),
        '--extensionDevelopmentPath',
        join(root, 'extension'),
        '--extensionTestsPath',
        join(root, 'scripts/extension-editor-smoke.cjs'),
        join(base, 'projects.code-workspace'),
      ],
      {
        windowsHide: true,
        shell: false,
        env,
        stdio: ['ignore', stdout.fd, stderr.fd],
      },
    );
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(`${editor} runner exited ${code}; inspect ${result}.`),
            ),
      );
    });
    const evidence = JSON.parse(await readFile(result, 'utf8'));
    if (!evidence.ok) throw new Error(`${editor}: ${evidence.error}`);
    console.log(
      `${editor}: ${evidence.checks.length} editor checks passed. Evidence: ${result}`,
    );
  } finally {
    await stdout.close();
    await stderr.close();
  }
}
