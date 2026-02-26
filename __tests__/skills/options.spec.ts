import { expect, it } from 'vitest';

import {
  DEFAULT_SYNC_BRANCH,
  DEFAULT_SYNC_REPO_PATH,
  normalizeSyncCliOptions,
  toSyncContext,
} from '@/skills/options';

it('normalizes sync options with defaults', () => {
  const normalized = normalizeSyncCliOptions({});

  expect(normalized).toEqual({
    repo: undefined,
    branch: DEFAULT_SYNC_BRANCH,
    repoPath: DEFAULT_SYNC_REPO_PATH,
    target: undefined,
    includeSystem: false,
    yes: false,
  });
});

it('normalizes sync options with overrides', () => {
  const normalized = normalizeSyncCliOptions({
    repo: 'https://github.com/acme/skills.git',
    branch: 'dev',
    repoPath: '.custom/skills',
    target: 'local',
    includeSystem: true,
    yes: true,
  });

  expect(normalized).toEqual({
    repo: 'https://github.com/acme/skills.git',
    branch: 'dev',
    repoPath: '.custom/skills',
    target: 'local',
    includeSystem: true,
    yes: true,
  });
});

it('creates a sync context from normalized options', () => {
  const context = toSyncContext(
    normalizeSyncCliOptions({ target: 'root' }),
    '/tmp/project',
    { HOME: '/tmp/home' },
  );

  expect(context).toEqual({
    repoUrl: undefined,
    branch: DEFAULT_SYNC_BRANCH,
    repoPath: DEFAULT_SYNC_REPO_PATH,
    includeSystem: false,
    target: 'root',
    yes: false,
    cwd: '/tmp/project',
    env: { HOME: '/tmp/home' },
  });
});
