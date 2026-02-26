import { access } from 'node:fs/promises';
import path from 'node:path';

import type { SkillRecord, SyncPlanItem } from '@/skills/types';

const pathExists = async (value: string): Promise<boolean> => {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
};

export const buildSyncPlan = async (
  selectedSkills: SkillRecord[],
  destinationRoot: string,
): Promise<SyncPlanItem[]> => {
  const items: SyncPlanItem[] = [];

  for (const skill of selectedSkills) {
    const destDir = path.join(destinationRoot, skill.id);
    const exists = await pathExists(destDir);

    items.push({
      skillId: skill.id,
      action: exists ? 'replace' : 'create',
      sourceDir: skill.sourceDir,
      destDir,
    });
  }

  return items;
};
