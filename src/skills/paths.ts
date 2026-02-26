import path from 'node:path';

import type { SyncTarget } from '@/skills/types';

export const resolveRootSkillsDirectory = (env: NodeJS.ProcessEnv): string => {
  const xdgHome = env.XDG_HOME?.trim();
  if (xdgHome) {
    return path.resolve(xdgHome, 'skills');
  }

  const home = env.HOME?.trim();
  if (!home) {
    throw new Error('Unable to resolve root skills path: HOME is not set.');
  }

  return path.resolve(home, 'skills');
};

export const resolveLocalSkillsDirectory = (cwd: string): string => {
  return path.resolve(cwd, 'skills');
};

export const resolveDestinationRoot = (
  target: SyncTarget,
  cwd: string,
  env: NodeJS.ProcessEnv,
): string => {
  if (target === 'local') {
    return resolveLocalSkillsDirectory(cwd);
  }

  return resolveRootSkillsDirectory(env);
};
