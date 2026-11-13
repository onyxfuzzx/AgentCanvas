import { spawnSync } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import * as prettier from 'prettier';

// Enumerate sources before formatting. Prettier's directory walk can otherwise
// traverse large or private generated folders before applying ignore rules.
const listed = spawnSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8', shell: false },
);
if (listed.status !== 0)
  throw new Error(
    listed.error?.message || 'Run formatting from a Git checkout.',
  );
const write = process.argv.includes('--write');
let count = 0;
const invalid = [];
for (const file of new Set(listed.stdout.split('\0').filter(Boolean))) {
  try {
    await access(file);
  } catch (error) {
    if (error.code === 'ENOENT') continue; // Deleted tracked files.
    throw error;
  }
  const info = await prettier.getFileInfo(file, {
    ignorePath: '.prettierignore',
  });
  if (info.ignored || !info.inferredParser) continue;
  const options = { ...(await prettier.resolveConfig(file)), filepath: file };
  const input = await readFile(file, 'utf8');
  if (write) {
    const output = await prettier.format(input, options);
    if (input !== output) {
      await writeFile(file, output);
      console.log(file);
    }
  } else if (!(await prettier.check(input, options))) invalid.push(file);
  count++;
}
for (const file of invalid) console.error(`Formatting required: ${file}`);
console.log(`${count} source files ${write ? 'formatted' : 'checked'}.`);
if (invalid.length) process.exitCode = 1;
