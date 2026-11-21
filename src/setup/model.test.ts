import { expect, test } from 'vitest';
import type { Availability, LibraryReply } from '../agents/catalog';
import type { Transport } from '../terminal/session';
import { AgentSetup, configuredLibrary, initialProviders } from './model';
import { providerExecutables } from '../agents/providers';
const roleId = '00000000-0000-4000-8000-000000000001';
const profileId = '00000000-0000-4000-8000-000000000002';
const uuid = () => '00000000-0000-4000-8000-000000000003';
const baseline = (): LibraryReply => ({
  fingerprint: 'one',
  recovered: false,
  library: {
    version: 1,
    revision: 0,
    roles: [{ id: roleId, name: 'Reviewer', instructions: 'Do not edit.' }],
    profiles: [
      {
        id: profileId,
        name: 'Existing Claude',
        roleId,
        provider: 'claude',
        executable: 'C:\\old\\claude.exe',
      },
    ],
  },
});
const ready: Availability = {
  provider: 'codex',
  available: true,
  path: 'C:\\bin\\codex.exe',
  error: null,
};
test('setup changes only selected presets, preserves existing roles and never enables a provider implicitly', () => {
  const reply = baseline();
  const configs = initialProviders(reply, uuid);
  expect(configs.every((config) => !config.enabled)).toBe(true);
  expect(configuredLibrary(reply.library, configs, uuid())).toEqual(
    reply.library,
  );
  configs[0] = { ...configs[0], enabled: true, name: 'My Codex' };
  const next = configuredLibrary(reply.library, configs, uuid());
  expect(next.profiles[0]).toEqual(reply.library.profiles[0]);
  expect(next.roles).toEqual(reply.library.roles);
  expect(next.profiles[1]).toMatchObject({
    name: 'My Codex',
    provider: 'codex',
    roleId,
  });
  expect(next.profiles[1].executable).toBeUndefined();
});
test('a missing executable blocks every write, flush and completion marker', async () => {
  const calls: string[] = [];
  const transport: Transport = async <T>(command: string) => {
    calls.push(command);
    return (
      command === 'agent_catalog'
        ? baseline()
        : command === 'agent_providers'
          ? []
          : { ...ready, available: false, error: 'not found' }
    ) as T;
  };
  const service = new AgentSetup(
    transport,
    uuid,
    async () => {
      calls.push('flush');
    },
    async () => {
      calls.push('complete');
    },
  );
  const { reply } = await service.load();
  const configs = initialProviders(reply, uuid);
  configs[0].enabled = true;
  await expect(service.finish(configs)).rejects.toThrow('not found');
  expect(calls).not.toContain('agent_catalog_save');
  expect(calls).not.toContain('flush');
  expect(calls).not.toContain('complete');
});

test('Antigravity setup uses agy.exe and preserves other providers and custom roles', () => {
  const reply = baseline();
  let id = 100;
  const configs = initialProviders(
    reply,
    () => `00000000-0000-4000-8000-${String(id++).padStart(12, '0')}`,
  );
  expect(configs.map((c) => c.provider)).toEqual([
    'codex',
    'antigravity',
    'claude',
  ]);
  const index = configs.findIndex((c) => c.provider === 'antigravity');
  configs[index] = {
    ...configs[index],
    enabled: true,
    name: 'AGY reviewer',
    executable: 'C:\\tools\\agy.exe',
  };
  const next = configuredLibrary(reply.library, configs, uuid());
  expect(next.roles).toEqual(reply.library.roles);
  expect(next.profiles[0]).toEqual(reply.library.profiles[0]);
  expect(next.profiles[1]).toMatchObject({
    provider: 'antigravity',
    name: 'AGY reviewer',
    executable: 'C:\\tools\\agy.exe',
    roleId,
  });
  expect(providerExecutables[next.profiles[1].provider]).toBe('agy.exe');
});
test('retry after a failed workspace flush preserves preset IDs and does not save twice', async () => {
  let reply = baseline(),
    writes = 0,
    flushes = 0,
    completed = 0;
  const transport: Transport = async <T>(
    command: string,
    args?: Record<string, unknown>,
  ) => {
    if (command === 'agent_catalog') return reply as T;
    if (command === 'agent_providers') return [] as T;
    if (command === 'agent_inspect') return ready as T;
    if (command === 'agent_catalog_save') {
      writes++;
      reply = {
        ...reply,
        fingerprint: 'two',
        library: args!.library as LibraryReply['library'],
      };
      return reply as T;
    }
    throw new Error(`Unexpected operation: ${command}`);
  };
  const service = new AgentSetup(
    transport,
    uuid,
    async () => {
      if (++flushes === 1) throw new Error('disk unavailable');
    },
    async () => {
      completed++;
    },
  );
  const data = await service.load();
  const configs = initialProviders(data.reply, uuid);
  configs[0].enabled = true;
  await expect(service.finish(configs)).rejects.toThrow('disk unavailable');
  expect(completed).toBe(0);
  await service.finish(configs);
  expect(writes).toBe(1);
  expect(completed).toBe(1);
  expect(
    reply.library.profiles.filter(
      (profile) => profile.id === configs[0].profileId,
    ),
  ).toHaveLength(1);
});
test('terminal-only setup leaves the preset library untouched and completes after workspace flush', async () => {
  const calls: string[] = [];
  const transport: Transport = async <T>(command: string) => {
    calls.push(command);
    if (command === 'agent_catalog') return baseline() as T;
    if (command === 'agent_providers') return [] as T;
    throw new Error(`Unexpected operation: ${command}`);
  };
  const service = new AgentSetup(
    transport,
    uuid,
    async () => {
      calls.push('flush');
    },
    async () => {
      calls.push('complete');
    },
  );
  const { reply } = await service.load();
  await service.finish(initialProviders(reply, uuid));
  expect(calls.slice(-2)).toEqual(['flush', 'complete']);
  expect(calls).not.toContain('agent_inspect');
  expect(calls).not.toContain('agent_catalog_save');
});
