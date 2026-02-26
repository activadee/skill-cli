import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { parseSkillFrontmatter } from '@/skills/frontmatter';
import type { SkillRecord } from '@/skills/types';

const normalizeRelativePath = (value: string): string => value.split(path.sep).join('/');

const isSystemSkill = (id: string): boolean => id === '.system' || id.startsWith('.system/');

const createSkillRecord = async (
  sourceRoot: string,
  sourceDir: string,
  includeSystem: boolean,
): Promise<SkillRecord | null> => {
  const relative = normalizeRelativePath(path.relative(sourceRoot, sourceDir));
  if (!relative || relative === '.') {
    return null;
  }

  const system = isSystemSkill(relative);
  if (system && !includeSystem) {
    return null;
  }

  const manifestPath = path.join(sourceDir, 'SKILL.md');
  const content = await readFile(manifestPath, 'utf8');
  const frontmatter = parseSkillFrontmatter(content);

  return {
    id: relative,
    displayName: frontmatter.name?.trim() || path.basename(sourceDir),
    description: frontmatter.description?.trim() || undefined,
    sourceDir,
    isSystem: system,
  };
};

const walkForSkills = async (
  sourceRoot: string,
  dir: string,
  includeSystem: boolean,
  out: SkillRecord[],
): Promise<void> => {
  const entries = await readdir(dir, { withFileTypes: true });

  const hasManifest = entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md');
  if (hasManifest) {
    const record = await createSkillRecord(sourceRoot, dir, includeSystem);
    if (record) {
      out.push(record);
    }
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (entry.name === '.git') {
      continue;
    }

    const child = path.join(dir, entry.name);
    await walkForSkills(sourceRoot, child, includeSystem, out);
  }
};

export const discoverSkills = async (
  sourceRoot: string,
  includeSystem: boolean,
): Promise<SkillRecord[]> => {
  const sourceStats = await stat(sourceRoot).catch(() => null);
  if (!sourceStats || !sourceStats.isDirectory()) {
    throw new Error(`Skills source path not found: ${sourceRoot}`);
  }

  const skills: SkillRecord[] = [];
  await walkForSkills(sourceRoot, sourceRoot, includeSystem, skills);

  skills.sort((left, right) => {
    const bySystem = Number(left.isSystem) - Number(right.isSystem);
    if (bySystem !== 0) {
      return bySystem;
    }
    return left.id.localeCompare(right.id);
  });

  return skills;
};
