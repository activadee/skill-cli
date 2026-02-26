export type SyncTarget = 'root' | 'local';

export type SkillRecord = {
  id: string;
  displayName: string;
  description?: string;
  sourceDir: string;
  isSystem: boolean;
};

export type SyncPlanAction = 'create' | 'replace';

export type SyncPlanItem = {
  skillId: string;
  action: SyncPlanAction;
  sourceDir: string;
  destDir: string;
};

export type SyncContext = {
  repoUrl?: string;
  branch: string;
  repoPath: string;
  includeSystem: boolean;
  target?: SyncTarget;
  yes: boolean;
  cwd: string;
  env: NodeJS.ProcessEnv;
};

export type ResolvedSyncContext = SyncContext & { repoUrl: string };

export type SyncExecutionStatus = 'created' | 'replaced' | 'skipped' | 'failed';

export type SyncExecutionEntry = {
  skillId: string;
  status: SyncExecutionStatus;
  destDir: string;
  error?: string;
};
