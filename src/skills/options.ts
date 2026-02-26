import type { SyncContext, SyncTarget } from '@/skills/types';

export const DEFAULT_SYNC_BRANCH = 'main';
export const DEFAULT_SYNC_REPO_PATH = 'skills';

export type SyncCliOptionsInput = {
  repo?: string;
  branch?: string;
  repoPath?: string;
  target?: SyncTarget;
  includeSystem?: boolean;
  yes?: boolean;
};

export type SyncCliOptions = {
  repo?: string;
  branch: string;
  repoPath: string;
  target?: SyncTarget;
  includeSystem: boolean;
  yes: boolean;
};

export const normalizeSyncCliOptions = (options: SyncCliOptionsInput): SyncCliOptions => ({
  repo: options.repo?.trim() || undefined,
  branch: options.branch?.trim() || DEFAULT_SYNC_BRANCH,
  repoPath: options.repoPath?.trim() || DEFAULT_SYNC_REPO_PATH,
  target: options.target,
  includeSystem: Boolean(options.includeSystem),
  yes: Boolean(options.yes),
});

export const toSyncContext = (
  options: SyncCliOptions,
  cwd: string,
  env: NodeJS.ProcessEnv,
): SyncContext => ({
  repoUrl: options.repo,
  branch: options.branch,
  repoPath: options.repoPath,
  includeSystem: options.includeSystem,
  target: options.target,
  yes: options.yes,
  cwd,
  env,
});
