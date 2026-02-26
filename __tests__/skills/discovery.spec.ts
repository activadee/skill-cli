import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, expect, it } from 'vitest';

import { discoverSkills } from '@/skills/discovery';

const tempRoots: string[] = [];

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await rm(root, { recursive: true, force: true });
    }
  }
});

const createSkill = async (root: string, relativePath: string, frontmatter: string) => {
  const skillDir = path.join(root, relativePath);
  await mkdir(skillDir, { recursive: true });
  await writeFile(path.join(skillDir, 'SKILL.md'), frontmatter, 'utf8');
};

it('discovers only directories that contain SKILL.md', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skills-discovery-'));
  tempRoots.push(root);

  await createSkill(
    root,
    'alpha',
    ['---', 'name: Alpha', 'description: Alpha description', '---', '', '# Alpha'].join('\n'),
  );

  await mkdir(path.join(root, 'beta'), { recursive: true });
  await writeFile(path.join(root, 'beta', 'README.md'), 'not a skill', 'utf8');

  await createSkill(
    root,
    'nested/omega',
    ['---', 'name: Omega', 'description: Omega description', '---'].join('\n'),
  );

  const skills = await discoverSkills(root, false);

  expect(skills.map((skill) => skill.id)).toEqual(['alpha', 'nested/omega']);
  expect(skills[0]?.displayName).toBe('Alpha');
  expect(skills[1]?.description).toBe('Omega description');
});

it('filters .system skills by default and includes them when requested', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'skills-discovery-system-'));
  tempRoots.push(root);

  await createSkill(root, '.system/system-one', ['---', 'name: System One', '---'].join('\n'));
  await createSkill(root, 'standard', ['---', 'name: Standard', '---'].join('\n'));

  const withoutSystem = await discoverSkills(root, false);
  const withSystem = await discoverSkills(root, true);

  expect(withoutSystem.map((skill) => skill.id)).toEqual(['standard']);
  expect(withSystem.map((skill) => skill.id)).toEqual(['standard', '.system/system-one']);
});
