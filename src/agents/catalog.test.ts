import { expect, test } from 'vitest';
import { snapshotProfile, type Library } from './catalog';
test('agent nodes keep launch settings when reusable presets and roles change or disappear', () => {
  const library: Library = {
    version: 1,
    revision: 1,
    roles: [
      {
        id: 'role',
        name: 'Reviewer',
        instructions: 'Read the diff. Do not edit.',
      },
    ],
    profiles: [
      {
        id: 'preset',
        name: 'My reviewer',
        provider: 'claude',
        roleId: 'role',
        executable: 'C:\\tools\\claude.exe',
      },
    ],
  };
  const settings = snapshotProfile(library, library.profiles[0]);
  library.roles[0].instructions = 'Changed';
  library.profiles[0].name = 'Changed';
  library.roles = [];
  library.profiles = [];
  expect(settings).toEqual({
    provider: 'claude',
    profileName: 'My reviewer',
    roleName: 'Reviewer',
    instructions: 'Read the diff. Do not edit.',
    executable: 'C:\\tools\\claude.exe',
  });
  expect(() =>
    snapshotProfile(library, {
      id: 'x',
      name: 'Broken',
      provider: 'codex',
      roleId: 'missing',
    }),
  ).toThrow('no role');
});
