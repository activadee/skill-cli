import { Command, Option } from 'commander';

import {
  DEFAULT_SYNC_BRANCH,
  DEFAULT_SYNC_REPO_PATH,
  type SyncCliOptionsInput,
} from '@/skills/options';
import { syncCommandHandler } from '@/skills/sync.command';

export const parse = ({ argv, pkg }: { argv: string[]; pkg: Package }): (() => Promise<void>) => {
  const program = new Command();

  program
    .name('skills')
    .description(pkg.description)
    .version(pkg.version, '-v, --version', 'output the current version')
    .showSuggestionAfterError()
    .showHelpAfterError();

  program
    .command('sync')
    .description('Sync selected skills from a remote repository into root or local destinations')
    .option('--repo <url>', 'override source repository URL (defaults to origin remote)')
    .option('--branch <name>', 'source repository branch', DEFAULT_SYNC_BRANCH)
    .option('--repo-path <path>', 'repository path that contains skills', DEFAULT_SYNC_REPO_PATH)
    .addOption(
      new Option('--target <target>', 'preselect destination target').choices(['root', 'local']),
    )
    .option('--include-system', 'include .system skills in selection')
    .option('--yes', 'skip overwrite confirmations')
    .action(async (rawOptions: SyncCliOptionsInput) => {
      await syncCommandHandler(rawOptions);
    });

  return async () => {
    if (argv.length <= 2) {
      program.outputHelp();
      return;
    }

    await program.parseAsync(argv);
  };
};
