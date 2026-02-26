import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { applySyncPlanItem } from '@/skills/apply';
import { buildSyncPlan } from '@/skills/plan';
import type { SkillRecord } from '@/skills/types';

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

const createSkillFolder = async (root: string, relativePath: string, message: string) => {
  const dir = path.join(root, relativePath);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${relativePath}\n---\n`, 'utf8');
  await writeFile(path.join(dir, 'message.txt'), message, 'utf8');
  return dir;
};

it('marks create vs replace in sync plan', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skills-plan-'));
  tempRoots.push(root);

  const sourceRoot = path.join(root, 'source');
  const destRoot = path.join(root, 'dest');

  const alpha = await createSkillFolder(sourceRoot, 'alpha', 'new-alpha');
  const beta = await createSkillFolder(sourceRoot, 'beta', 'new-beta');

  await createSkillFolder(destRoot, 'beta', 'old-beta');

  const selected: SkillRecord[] = [
    { id: 'alpha', displayName: 'alpha', sourceDir: alpha, isSystem: false },
    { id: 'beta', displayName: 'beta', sourceDir: beta, isSystem: false },
  ];

  const plan = await buildSyncPlan(selected, destRoot);

  expect(plan).toEqual([
    {
      skillId: 'alpha',
      action: 'create',
      sourceDir: alpha,
      destDir: path.join(destRoot, 'alpha'),
    },
    {
      skillId: 'beta',
      action: 'replace',
      sourceDir: beta,
      destDir: path.join(destRoot, 'beta'),
    },
  ]);
});

it('replaces selected skill directory and keeps non-selected directories untouched', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skills-apply-'));
  tempRoots.push(root);

  const sourceRoot = path.join(root, 'source');
  const destRoot = path.join(root, 'dest');

  const sourceSkillDir = await createSkillFolder(sourceRoot, 'alpha', 'fresh-content');
  await createSkillFolder(destRoot, 'alpha', 'stale-content');
  await createSkillFolder(destRoot, 'extra-skill', 'keep-me');

  const plan = await buildSyncPlan(
    [{ id: 'alpha', displayName: 'alpha', sourceDir: sourceSkillDir, isSystem: false }],
    destRoot,
  );

  const result = await applySyncPlanItem(plan[0]!);
  expect(result.status).toBe('replaced');

  const replacedMessage = await readFile(path.join(destRoot, 'alpha', 'message.txt'), 'utf8');
  const untouchedMessage = await readFile(path.join(destRoot, 'extra-skill', 'message.txt'), 'utf8');

  expect(replacedMessage).toBe('fresh-content');
  expect(untouchedMessage).toBe('keep-me');
});
