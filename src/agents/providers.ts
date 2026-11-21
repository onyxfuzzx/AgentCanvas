import type { AgentProvider } from '../canvas/model.js';

export const agentProviders = ['codex', 'antigravity', 'claude'] as const;
export const providerNames: Record<AgentProvider, string> = {
  codex: 'Codex',
  antigravity: 'Antigravity',
  claude: 'Claude Code',
};
export const providerExecutables: Record<AgentProvider, string> = {
  codex: 'codex.exe',
  antigravity: 'agy.exe',
  claude: 'claude.exe',
};
export function isAgentProvider(value: unknown): value is AgentProvider {
  return typeof value === 'string' && Object.hasOwn(providerNames, value);
}
