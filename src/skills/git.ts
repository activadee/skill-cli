import { execFile } from 'node:child_process';
import { stat, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type ClonedSkillsSource = {
  tempDir: string;
  cloneDir: string;
  sourceRoot: string;
};

const summarizeGitError = (error: unknown): string => {
  if (!error || typeof error !== 'object') {
    return 'unknown git error';
  }

  const maybe = error as { stderr?: string; message?: string };
  const stderr = maybe.stderr?.trim();
  if (stderr) {
    const lines = stderr.split(/\r?\n/).slice(0, 6);
    return lines.join('\n');
  }

  return maybe.message || 'unknown git error';
};

export const resolveDefaultRepoUrl = async (cwd: string): Promise<string> => {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], {
      cwd,
    });

    const repoUrl = stdout.trim();
    if (!repoUrl) {
      throw new Error('No origin remote is configured.');
    }

    return repoUrl;
  } catch (error) {
    const details = summarizeGitError(error);
    throw new Error(`Unable to resolve default repo URL from origin: ${details}`);
  }
};

export const cloneSkillsSource = async (args: {
  repoUrl: string;
  branch: string;
  repoPath: string;
}): Promise<ClonedSkillsSource> => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'skills-sync-'));
  const cloneDir = path.join(tempDir, 'source');

  try {
    await execFileAsync(
      'git',
      ['clone', '--depth', '1', '--branch', args.branch, args.repoUrl, cloneDir],
      { cwd: tempDir },
    );
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    const details = summarizeGitError(error);
    throw new Error(
      `Failed to clone ${args.repoUrl}#${args.branch}. ${details}\n` +
      'Check repository access, branch name, and network connectivity.',
    );
  }

  const sourceRoot = path.resolve(cloneDir, args.repoPath);
  const sourceStats = await stat(sourceRoot).catch(() => null);
  if (!sourceStats || !sourceStats.isDirectory()) {
    await rm(tempDir, { recursive: true, force: true });
    throw new Error(`Skills directory not found in repo: ${args.repoPath}`);
  }

  return { tempDir, cloneDir, sourceRoot };
};

export const cleanupClonedSource = async (tempDir?: string): Promise<void> => {
  if (!tempDir) {
    return;
  }
  await rm(tempDir, { recursive: true, force: true });
};
