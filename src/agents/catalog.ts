import type { AgentProvider, AgentSettings } from '../canvas/model';
export type Role = { id: string; name: string; instructions: string };
export type Profile = {
  id: string;
  name: string;
  provider: AgentProvider;
  roleId: string;
  executable?: string;
};
export type Library = {
  version: number;
  revision: number;
  roles: Role[];
  profiles: Profile[];
};
export type LibraryReply = {
  library: Library;
  fingerprint: string | null;
  recovered: boolean;
};
export type Availability = {
  provider: AgentProvider;
  available: boolean;
  path: string | null;
  error: string | null;
};
export function snapshotProfile(
  library: Library,
  profile: Profile,
): AgentSettings {
  const role = library.roles.find((r) => r.id === profile.roleId);
  if (!role)
    throw new Error('This preset has no role. Choose a role in Agent presets.');
  return {
    provider: profile.provider,
    profileName: profile.name,
    roleName: role.name,
    instructions: role.instructions,
    ...(profile.executable ? { executable: profile.executable } : {}),
  };
}
export const instructionBytes = (text: string) =>
  new TextEncoder().encode(text).length;
