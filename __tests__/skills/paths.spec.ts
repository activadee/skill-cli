import { expect, it } from 'vitest';

import {
  resolveDestinationRoot,
  resolveLocalSkillsDirectory,
  resolveRootSkillsDirectory,
} from '@/skills/paths';

it('uses XDG_HOME for root destination when available', () => {
  const root = resolveRootSkillsDirectory({ XDG_HOME: '/workspace' });
  expect(root).toBe('/workspace/skills');
});

it('falls back to HOME for root destination when XDG_HOME is absent', () => {
  const root = resolveRootSkillsDirectory({ HOME: '/Users/tester' });
  expect(root).toBe('/Users/tester/skills');
});

it('resolves local destination under cwd', () => {
  const local = resolveLocalSkillsDirectory('/repo/project');
  expect(local).toBe('/repo/project/skills');
});

it('resolves destination root for target', () => {
  const root = resolveDestinationRoot('root', '/repo/project', { HOME: '/Users/tester' });
  const local = resolveDestinationRoot('local', '/repo/project', { HOME: '/Users/tester' });

  expect(root).toBe('/Users/tester/skills');
  expect(local).toBe('/repo/project/skills');
});
