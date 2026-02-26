import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import type { SyncExecutionEntry, SyncPlanItem } from '@/skills/types';

export const applySyncPlanItem = async (item: SyncPlanItem): Promise<SyncExecutionEntry> => {
  try {
    await mkdir(path.dirname(item.destDir), { recursive: true });

    if (item.action === 'replace') {
      await rm(item.destDir, { recursive: true, force: true });
    }

    await cp(item.sourceDir, item.destDir, {
      recursive: true,
      force: true,
      errorOnExist: false,
      preserveTimestamps: true,
    });

    return {
      skillId: item.skillId,
      status: item.action === 'replace' ? 'replaced' : 'created',
      destDir: item.destDir,
    };
  } catch (error) {
    return {
      skillId: item.skillId,
      status: 'failed',
      destDir: item.destDir,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const createSkippedEntry = (item: SyncPlanItem): SyncExecutionEntry => ({
  skillId: item.skillId,
  status: 'skipped',
  destDir: item.destDir,
});
