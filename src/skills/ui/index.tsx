import { render } from 'ink';

import type { SyncContext } from '@/skills/types';
import { SyncApplication } from '@/skills/ui/sync.application';

export const runSyncInkApplication = async (context: SyncContext): Promise<number> => {
  let exitCode = 0;

  const { waitUntilExit } = render(
    <SyncApplication
      context={context}
      onComplete={(code) => {
        exitCode = code;
      }}
    />,
  );

  await waitUntilExit();
  return exitCode;
};
