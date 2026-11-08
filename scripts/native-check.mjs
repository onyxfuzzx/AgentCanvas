import { spawnSync } from 'node:child_process';
for (const args of [
  ['fmt', '--check'],
  ['clippy', '--locked', '--all-targets', '--', '-D', 'warnings'],
  ['test', '--locked', '--all-targets'],
]) {
  const result = spawnSync('cargo', args, {
    cwd: 'src-tauri',
    stdio: 'inherit',
  });
  if (result.error) console.error(result.error.message);
  if (result.status !== 0) process.exit(result.status ?? 1);
}
