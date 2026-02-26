import {
  normalizeSyncCliOptions,
  type SyncCliOptionsInput,
  toSyncContext,
} from '@/skills/options';
import { runSyncInkApplication } from '@/skills/ui';

export const syncCommandHandler = async (
  rawOptions: SyncCliOptionsInput,
  runtime?: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<number> => {
  const options = normalizeSyncCliOptions(rawOptions);
  const context = toSyncContext(
    options,
    runtime?.cwd ?? process.cwd(),
    runtime?.env ?? process.env,
  );

  try {
    const code = await runSyncInkApplication(context);
    if (code !== 0) {
      process.exitCode = code;
    }
    return code;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`skills sync failed: ${message}`);
    process.exitCode = 1;
    return 1;
  }
};
