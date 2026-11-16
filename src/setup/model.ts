import type { AgentProvider } from '../canvas/model';
import type { Availability, Library, LibraryReply } from '../agents/catalog';
import type { Transport } from '../terminal/session';

export const providerNames = { codex: 'Codex', claude: 'Claude Code' };
export const providerHelp = {
  codex: {
    install: 'https://developers.openai.com/codex/cli',
    auth: 'https://developers.openai.com/codex/auth',
  },
  claude: {
    install: 'https://code.claude.com/docs/en/setup',
    auth: 'https://code.claude.com/docs/en/authentication',
  },
};
export type ProviderSetup = {
  provider: AgentProvider;
  enabled: boolean;
  profileId: string;
  name: string;
  executable: string;
};
export function initialProviders(
  reply: LibraryReply,
  uuid: () => string,
): ProviderSetup[] {
  return (['codex', 'claude'] as const).map((provider) => {
    const profile = reply.library.profiles.find(
      (profile) => profile.provider === provider,
    );
    return {
      provider,
      enabled: false,
      profileId: profile?.id ?? uuid(),
      name: profile?.name ?? `${providerNames[provider]} agent`,
      executable: profile?.executable ?? '',
    };
  });
}
export function configuredLibrary(
  library: Library,
  configs: ProviderSetup[],
  builderId: string,
): Library {
  const next: Library = {
    ...library,
    roles: [...library.roles],
    profiles: [...library.profiles],
  };
  for (const config of configs.filter((config) => config.enabled)) {
    if (!config.name.trim() || config.name.trim().length > 80)
      throw new Error('Preset names must contain 1–80 characters.');
    const existing = next.profiles.find(
      (profile) => profile.id === config.profileId,
    );
    if (existing && existing.provider !== config.provider)
      throw new Error(
        'This preset belongs to another provider. Reload setup data.',
      );
    if (!existing && next.profiles.length >= 32)
      throw new Error(
        'The preset library is full. Remove an unused preset in Agent presets.',
      );
    if (!next.roles.length)
      next.roles.push({
        id: builderId,
        name: 'Builder',
        instructions:
          'Follow project conventions, implement the assigned task, and report only checks you actually ran.',
      });
    const profile = {
      id: config.profileId,
      name: config.name.trim(),
      provider: config.provider,
      roleId:
        existing?.roleId ??
        (next.roles.find((role) => role.name === 'Builder') ?? next.roles[0])
          .id,
      ...(config.executable.trim()
        ? { executable: config.executable.trim() }
        : {}),
    };
    next.profiles = existing
      ? next.profiles.map((saved) =>
          saved.id === profile.id ? profile : saved,
        )
      : [...next.profiles, profile];
  }
  return next;
}

export function setupTroubleshooting(error: string): string {
  if (/extern|fingerprint|changed|conflict/i.test(error))
    return 'Your files have been preserved. Use Reload setup data to read the current presets, then review your choices again.';
  if (/lock|another|in use/i.test(error))
    return 'Close the other canvas using this workspace, then retry. Choose another workspace to keep both sessions open.';
  if (/executable|native CLI|path|missing|not found/i.test(error))
    return 'Install the provider’s native Windows CLI using its official guide, restart the editor to refresh PATH, or browse to codex.exe / claude.exe. Shell launcher files (.cmd and .ps1) cannot be selected.';
  return 'Keep the error shown here, correct the selected folder or preset, and retry. You can also continue using terminals without configuring an agent.';
}

/** Completion is recorded last; a retry after a failed flush updates the same preset IDs. */
export class AgentSetup {
  private reply?: LibraryReply;
  private operation?: Promise<void>;
  private builderId: string;
  constructor(
    private invoke: Transport,
    uuid: () => string,
    private flush: () => Promise<void>,
    private complete: () => Promise<void>,
  ) {
    this.builderId = uuid();
  }
  async load() {
    const [reply, providers] = await Promise.all([
      this.invoke<LibraryReply>('agent_catalog'),
      this.invoke<Availability[]>('agent_providers'),
    ]);
    this.reply = reply;
    return { reply, providers };
  }
  inspect(config: ProviderSetup) {
    return this.invoke<Availability>('agent_inspect', {
      provider: config.provider,
      executable: config.executable.trim() || null,
    });
  }
  finish(
    configs: ProviderSetup[],
    inspected?: (value: Availability) => void,
  ): Promise<void> {
    if (this.operation) return this.operation;
    this.operation = (async () => {
      if (!this.reply) throw new Error('Load setup data before saving.');
      for (const config of configs.filter((config) => config.enabled)) {
        const check = await this.inspect(config);
        inspected?.(check);
        if (!check.available)
          throw new Error(
            `${providerNames[config.provider]} executable: ${check.error ?? 'not found'}`,
          );
      }
      const library = configuredLibrary(
        this.reply.library,
        configs,
        this.builderId,
      );
      if (JSON.stringify(library) !== JSON.stringify(this.reply.library))
        this.reply = await this.invoke<LibraryReply>('agent_catalog_save', {
          expected: this.reply.fingerprint,
          library,
        });
      await this.flush();
      await this.complete();
    })().finally(() => {
      this.operation = undefined;
    });
    return this.operation;
  }
}
