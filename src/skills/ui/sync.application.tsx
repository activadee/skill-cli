import path from 'node:path';

import { Box, Text, useApp, useInput } from 'ink';
import { useEffect, useMemo, useRef, useState } from 'react';

import { applySyncPlanItem, createSkippedEntry } from '@/skills/apply';
import { discoverSkills } from '@/skills/discovery';
import { cleanupClonedSource, cloneSkillsSource, resolveDefaultRepoUrl } from '@/skills/git';
import { resolveDestinationRoot } from '@/skills/paths';
import { buildSyncPlan } from '@/skills/plan';
import type {
  SkillRecord,
  SyncContext,
  SyncExecutionEntry,
  SyncPlanItem,
  SyncTarget,
} from '@/skills/types';
import { toggleSetValue } from '@/skills/lib/set';

type Stage =
  | 'loading'
  | 'selectSkills'
  | 'selectTarget'
  | 'planPreview'
  | 'confirmOverwrite'
  | 'executing'
  | 'summary'
  | 'fatal';

type Summary = {
  totalSelected: number;
  created: number;
  replaced: number;
  skipped: number;
  failed: number;
  destinationRoot: string;
};

type SyncApplicationProps = {
  context: SyncContext;
  onComplete: (code: number) => void;
};

const SPINNER_FRAMES = ['-', '\\', '|', '/'];
const TARGET_OPTIONS: SyncTarget[] = ['root', 'local'];

const COLORS = {
  amber: '#f2a541',
  cyan: '#61dafb',
  steel: '#8ea0b2',
  muted: '#6b7280',
  danger: '#ff6b6b',
  success: '#6ee7b7',
};

const TITLE_LINES = [
  '  ____  _  _____ _     _     ____',
  ' / ___|| |/ /_ _| |   | |   / ___|',
  " \\___ \\| ' / | || |   | |   \\___ \\",
  '  ___) | . \\ | || |___| |___ ___) |',
  ' |____/|_|\\_\\___|_____|_____|____/',
];

const skillLabel = (skill: SkillRecord): string => `${skill.displayName} (${skill.id})`;

const summaryFromEntries = (
  entries: SyncExecutionEntry[],
  totalSelected: number,
  destinationRoot: string,
): Summary => {
  const created = entries.filter((entry) => entry.status === 'created').length;
  const replaced = entries.filter((entry) => entry.status === 'replaced').length;
  const skipped = entries.filter((entry) => entry.status === 'skipped').length;
  const failed = entries.filter((entry) => entry.status === 'failed').length;

  return {
    totalSelected,
    created,
    replaced,
    skipped,
    failed,
    destinationRoot,
  };
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const SyncApplication = ({ context, onComplete }: SyncApplicationProps) => {
  const { exit } = useApp();

  const [stage, setStage] = useState<Stage>('loading');
  const [spinnerTick, setSpinnerTick] = useState(0);
  const [pulseTick, setPulseTick] = useState(0);

  const [loadingMessage, setLoadingMessage] = useState('Initializing sync session...');
  const [fatalError, setFatalError] = useState<string | null>(null);

  const [resolvedRepoUrl, setResolvedRepoUrl] = useState('');
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [skillCursor, setSkillCursor] = useState(0);
  const [selectedSkillIds, setSelectedSkillIds] = useState<Set<string>>(new Set());

  const [selectedTarget, setSelectedTarget] = useState<SyncTarget | undefined>(context.target);
  const [targetCursor, setTargetCursor] = useState(context.target === 'local' ? 1 : 0);

  const [destinationRoot, setDestinationRoot] = useState('');
  const [planItems, setPlanItems] = useState<SyncPlanItem[]>([]);

  const [confirmQueue, setConfirmQueue] = useState<SyncPlanItem[]>([]);
  const [confirmIndex, setConfirmIndex] = useState(0);
  const [approvedReplacements, setApprovedReplacements] = useState<Set<string>>(new Set());
  const [skippedReplacements, setSkippedReplacements] = useState<Set<string>>(new Set());

  const [executionEntries, setExecutionEntries] = useState<SyncExecutionEntry[]>([]);
  const [activeExecutionSkill, setActiveExecutionSkill] = useState<string | null>(null);

  const [summary, setSummary] = useState<Summary | null>(null);

  const tempDirRef = useRef<string>();
  const finalizedRef = useRef(false);

  const selectedSkills = useMemo(
    () => skills.filter((skill) => selectedSkillIds.has(skill.id)),
    [skills, selectedSkillIds],
  );

  const highlightedSkill = skills[skillCursor];

  const frameWidth = Math.max(72, Math.min((process.stdout.columns || 118) - 2, 118));

  useEffect(() => {
    const timer = setInterval(() => setPulseTick((value) => value + 1), 450);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (stage !== 'loading') {
      return;
    }

    const timer = setInterval(() => {
      setSpinnerTick((value) => (value + 1) % SPINNER_FRAMES.length);
    }, 110);

    return () => clearInterval(timer);
  }, [stage]);

  const finalize = async (code: number) => {
    if (finalizedRef.current) {
      return;
    }
    finalizedRef.current = true;

    await cleanupClonedSource(tempDirRef.current);
    onComplete(code);
    exit();
  };

  const runExecution = async (
    executableItems: SyncPlanItem[],
    skippedReplacementIds: Set<string>,
  ) => {
    setStage('executing');
    setExecutionEntries([]);
    setActiveExecutionSkill(null);

    const entries: SyncExecutionEntry[] = [];

    for (const item of planItems) {
      if (item.action === 'replace' && skippedReplacementIds.has(item.skillId)) {
        entries.push(createSkippedEntry(item));
      }
    }

    setExecutionEntries([...entries]);

    for (const item of executableItems) {
      setActiveExecutionSkill(item.skillId);
      const result = await applySyncPlanItem(item);
      entries.push(result);
      setExecutionEntries([...entries]);

      if (result.status === 'failed') {
        break;
      }
    }

    setActiveExecutionSkill(null);

    const nextSummary = summaryFromEntries(entries, selectedSkills.length, destinationRoot);
    setSummary(nextSummary);
    setStage('summary');
  };

  const continueFromPlan = () => {
    if (context.yes) {
      const skipped = new Set<string>();
      void runExecution(planItems, skipped);
      return;
    }

    const replacements = planItems.filter((item) => item.action === 'replace');
    if (replacements.length === 0) {
      void runExecution(planItems, new Set<string>());
      return;
    }

    setConfirmQueue(replacements);
    setConfirmIndex(0);
    setApprovedReplacements(new Set());
    setSkippedReplacements(new Set());
    setStage('confirmOverwrite');
  };

  const finishConfirmations = (approvedIds: Set<string>, skippedIds: Set<string>) => {
    const executableItems = planItems.filter((item) => {
      if (item.action === 'create') {
        return true;
      }
      return approvedIds.has(item.skillId);
    });

    void runExecution(executableItems, skippedIds);
  };

  const selectTargetAndPlan = async (target: SyncTarget) => {
    try {
      const destination = resolveDestinationRoot(target, context.cwd, context.env);
      const nextPlan = await buildSyncPlan(selectedSkills, destination);

      setSelectedTarget(target);
      setDestinationRoot(destination);
      setPlanItems(nextPlan);
      setStage('planPreview');
    } catch (error) {
      setFatalError(errorMessage(error));
      setStage('fatal');
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoadingMessage('Resolving default source repository...');
        const repoUrl = context.repoUrl ?? (await resolveDefaultRepoUrl(context.cwd));
        if (cancelled) {
          return;
        }

        setResolvedRepoUrl(repoUrl);
        setLoadingMessage(`Cloning ${repoUrl}#${context.branch} (depth=1)...`);
        const clonedSource = await cloneSkillsSource({
          repoUrl,
          branch: context.branch,
          repoPath: context.repoPath,
        });

        if (cancelled) {
          await cleanupClonedSource(clonedSource.tempDir);
          return;
        }

        tempDirRef.current = clonedSource.tempDir;

        setLoadingMessage(`Scanning ${context.repoPath} for SKILL.md...`);
        const discoveredSkills = await discoverSkills(clonedSource.sourceRoot, context.includeSystem);

        if (cancelled) {
          return;
        }

        if (discoveredSkills.length === 0) {
          throw new Error(
            `No valid skills found under ${context.repoPath}. Expected folders with SKILL.md.`,
          );
        }

        setSkills(discoveredSkills);
        setStage('selectSkills');
      } catch (error) {
        if (cancelled) {
          return;
        }
        setFatalError(errorMessage(error));
        setStage('fatal');
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [context]);

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      void finalize(130);
      return;
    }

    if (stage === 'fatal') {
      if (key.return || input === 'q') {
        void finalize(1);
      }
      return;
    }

    if (stage === 'summary') {
      if (key.return || input === 'q') {
        const failed = summary?.failed ?? 0;
        void finalize(failed > 0 ? 1 : 0);
      }
      return;
    }

    if (stage === 'loading' || stage === 'executing') {
      return;
    }

    if (input === 'q') {
      void finalize(0);
      return;
    }

    if (stage === 'selectSkills') {
      if (key.upArrow) {
        setSkillCursor((value) => Math.max(value - 1, 0));
        return;
      }

      if (key.downArrow) {
        setSkillCursor((value) => Math.min(value + 1, Math.max(skills.length - 1, 0)));
        return;
      }

      if (input === ' ') {
        const skill = skills[skillCursor];
        if (!skill) {
          return;
        }

        setSelectedSkillIds((value) => toggleSetValue(value, skill.id));
        return;
      }

      if (input === 'a') {
        setSelectedSkillIds(new Set(skills.map((skill) => skill.id)));
        return;
      }

      if (input === 'n') {
        setSelectedSkillIds(new Set());
        return;
      }

      if (key.return) {
        if (selectedSkills.length === 0) {
          return;
        }

        if (context.target) {
          void selectTargetAndPlan(context.target);
          return;
        }

        setStage('selectTarget');
      }
      return;
    }

    if (stage === 'selectTarget') {
      if (key.upArrow || key.downArrow) {
        setTargetCursor((value) => (value === 0 ? 1 : 0));
        return;
      }

      if (input === 'b') {
        setStage('selectSkills');
        return;
      }

      if (key.return) {
        const target = TARGET_OPTIONS[targetCursor] || 'root';
        void selectTargetAndPlan(target);
      }
      return;
    }

    if (stage === 'planPreview') {
      if (input === 'b') {
        setStage(context.target ? 'selectSkills' : 'selectTarget');
        return;
      }

      if (key.return) {
        continueFromPlan();
      }
      return;
    }

    if (stage === 'confirmOverwrite') {
      const current = confirmQueue[confirmIndex];
      if (!current) {
        continueFromPlan();
        return;
      }

      if (input === 'a') {
        const approved = new Set(approvedReplacements);
        for (let index = confirmIndex; index < confirmQueue.length; index += 1) {
          const item = confirmQueue[index];
          if (item) {
            approved.add(item.skillId);
          }
        }
        setApprovedReplacements(approved);
        finishConfirmations(approved, skippedReplacements);
        return;
      }

      if (input !== 'y' && input !== 'n') {
        return;
      }

      const approved = new Set(approvedReplacements);
      const skipped = new Set(skippedReplacements);

      if (input === 'y') {
        approved.add(current.skillId);
      }

      if (input === 'n') {
        skipped.add(current.skillId);
      }

      const isLast = confirmIndex + 1 >= confirmQueue.length;
      if (isLast) {
        setApprovedReplacements(approved);
        setSkippedReplacements(skipped);
        finishConfirmations(approved, skipped);
        return;
      }

      setApprovedReplacements(approved);
      setSkippedReplacements(skipped);
      setConfirmIndex((value) => value + 1);
    }
  });

  const activePulse = pulseTick % 2 === 0;

  const renderHeader = () => (
    <Box borderStyle="round" borderColor={COLORS.amber} flexDirection="column" paddingX={1}>
      {TITLE_LINES.map((line) => (
        <Text key={line} color={COLORS.amber} bold>
          {line}
        </Text>
      ))}
      <Text color={COLORS.cyan}>INDUSTRIAL OPERATIONS BOARD :: skills sync</Text>
      <Text color={COLORS.steel}>source: {resolvedRepoUrl || '(resolving...)'} :: branch {context.branch}</Text>
    </Box>
  );

  const renderFooter = () => {
    let hint = 'q quit';

    if (stage === 'selectSkills') {
      hint = 'up/down move  space toggle  a all  n none  enter continue  q quit';
    } else if (stage === 'selectTarget') {
      hint = 'up/down switch target  enter continue  b back  q quit';
    } else if (stage === 'planPreview') {
      hint = 'enter execute  b back  q quit';
    } else if (stage === 'confirmOverwrite') {
      hint = 'y overwrite  n skip  a overwrite all remaining  q quit';
    } else if (stage === 'summary' || stage === 'fatal') {
      hint = 'enter exit  q quit';
    }

    return (
      <Box marginTop={1} borderStyle="single" borderColor={COLORS.steel} paddingX={1}>
        <Text color={COLORS.muted}>keys :: {hint}</Text>
      </Box>
    );
  };

  const renderLoading = () => (
    <Box marginTop={1} borderStyle="round" borderColor={COLORS.cyan} paddingX={1}>
      <Text color={COLORS.cyan}>
        [{SPINNER_FRAMES[spinnerTick]}] {loadingMessage}
      </Text>
    </Box>
  );

  const renderSkillSelection = () => (
    <Box marginTop={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={COLORS.steel} paddingX={1} width={Math.floor(frameWidth * 0.65)}>
        <Text bold color={COLORS.cyan}>Select Skills ({selectedSkills.length}/{skills.length})</Text>
        {skills.map((skill, index) => {
          const selected = selectedSkillIds.has(skill.id);
          const focused = index === skillCursor;
          const marker = selected ? '[x]' : '[ ]';
          const prefix = focused ? '>' : ' ';
          const color = focused ? (activePulse ? COLORS.amber : COLORS.cyan) : COLORS.steel;

          return (
            <Text key={skill.id} color={color}>
              {prefix} {marker} {skill.displayName}
              <Text color={COLORS.muted}> [{skill.id}]</Text>
            </Text>
          );
        })}
      </Box>

      <Box flexDirection="column" borderStyle="round" borderColor={COLORS.amber} paddingX={1} marginLeft={1} width={frameWidth - Math.floor(frameWidth * 0.65)}>
        <Text bold color={COLORS.amber}>Details</Text>
        {highlightedSkill ? (
          <>
            <Text color={COLORS.cyan}>{skillLabel(highlightedSkill)}</Text>
            <Text color={COLORS.steel}>type: {highlightedSkill.isSystem ? '.system' : 'standard'}</Text>
            <Text color={COLORS.muted}>{highlightedSkill.description || 'No description in frontmatter.'}</Text>
            <Text color={COLORS.muted}>source: {highlightedSkill.sourceDir}</Text>
          </>
        ) : (
          <Text color={COLORS.muted}>No skill highlighted.</Text>
        )}
      </Box>
    </Box>
  );

  const renderTargetSelection = () => (
    <Box marginTop={1} borderStyle="round" borderColor={COLORS.steel} paddingX={1} flexDirection="column">
      <Text bold color={COLORS.cyan}>Select Destination Target</Text>
      {TARGET_OPTIONS.map((target, index) => {
        const focused = index === targetCursor;
        const label = target === 'root' ? 'root -> $XDG_HOME/skills or ~/skills' : 'local -> <cwd>/skills';

        return (
          <Text key={target} color={focused ? COLORS.amber : COLORS.steel}>
            {focused ? '>' : ' '} {label}
          </Text>
        );
      })}
    </Box>
  );

  const renderPlanPreview = () => {
    const createCount = planItems.filter((item) => item.action === 'create').length;
    const replaceCount = planItems.filter((item) => item.action === 'replace').length;

    return (
      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor={COLORS.steel} paddingX={1}>
        <Text bold color={COLORS.cyan}>Plan Preview</Text>
        <Text color={COLORS.steel}>target: {selectedTarget}</Text>
        <Text color={COLORS.steel}>destination: {destinationRoot}</Text>
        <Text color={COLORS.success}>create: {createCount}</Text>
        <Text color={COLORS.amber}>replace: {replaceCount}</Text>
        {planItems.map((item) => (
          <Text key={item.skillId} color={item.action === 'replace' ? COLORS.amber : COLORS.steel}>
            - {item.action.toUpperCase()} {item.skillId}
            <Text color={COLORS.muted}> {'->'} {item.destDir}</Text>
          </Text>
        ))}
      </Box>
    );
  };

  const renderConfirmOverwrite = () => {
    const item = confirmQueue[confirmIndex];
    return (
      <Box marginTop={1} borderStyle="round" borderColor={COLORS.amber} paddingX={1} flexDirection="column">
        <Text bold color={COLORS.amber}>Overwrite Confirmation ({confirmIndex + 1}/{confirmQueue.length})</Text>
        {item ? (
          <>
            <Text color={COLORS.cyan}>replace skill: {item.skillId}</Text>
            <Text color={COLORS.steel}>destination: {item.destDir}</Text>
            <Text color={COLORS.muted}>Confirm overwrite?</Text>
          </>
        ) : (
          <Text color={COLORS.muted}>No overwrite items remaining.</Text>
        )}
      </Box>
    );
  };

  const renderExecution = () => (
    <Box marginTop={1} borderStyle="round" borderColor={COLORS.cyan} paddingX={1} flexDirection="column">
      <Text bold color={COLORS.cyan}>Executing Sync</Text>
      <Text color={COLORS.steel}>destination: {destinationRoot}</Text>
      <Text color={COLORS.amber}>active: {activeExecutionSkill || '(finalizing...)'}</Text>
      {executionEntries.map((entry) => {
        const color =
          entry.status === 'failed'
            ? COLORS.danger
            : entry.status === 'skipped'
              ? COLORS.muted
              : COLORS.success;

        return (
          <Text key={`${entry.skillId}-${entry.status}`} color={color}>
            - {entry.status.toUpperCase()} {entry.skillId}
            {entry.error ? ` :: ${entry.error}` : ''}
          </Text>
        );
      })}
    </Box>
  );

  const renderSummary = () => (
    <Box marginTop={1} borderStyle="round" borderColor={COLORS.success} paddingX={1} flexDirection="column">
      <Text bold color={COLORS.success}>Sync Summary</Text>
      <Text color={COLORS.steel}>destination: {summary?.destinationRoot}</Text>
      <Text color={COLORS.success}>created: {summary?.created ?? 0}</Text>
      <Text color={COLORS.success}>replaced: {summary?.replaced ?? 0}</Text>
      <Text color={COLORS.muted}>skipped: {summary?.skipped ?? 0}</Text>
      <Text color={(summary?.failed ?? 0) > 0 ? COLORS.danger : COLORS.steel}>failed: {summary?.failed ?? 0}</Text>
      <Text color={COLORS.steel}>selected: {summary?.totalSelected ?? 0}</Text>
      <Text color={COLORS.muted}>Press enter to exit.</Text>
    </Box>
  );

  const renderFatal = () => (
    <Box marginTop={1} borderStyle="round" borderColor={COLORS.danger} paddingX={1} flexDirection="column">
      <Text bold color={COLORS.danger}>Sync failed before execution</Text>
      <Text color={COLORS.steel}>{fatalError}</Text>
      <Text color={COLORS.muted}>Press enter to exit.</Text>
    </Box>
  );

  return (
    <Box flexDirection="column" width={frameWidth} paddingX={1}>
      {renderHeader()}
      {stage === 'loading' && renderLoading()}
      {stage === 'selectSkills' && renderSkillSelection()}
      {stage === 'selectTarget' && renderTargetSelection()}
      {stage === 'planPreview' && renderPlanPreview()}
      {stage === 'confirmOverwrite' && renderConfirmOverwrite()}
      {stage === 'executing' && renderExecution()}
      {stage === 'summary' && renderSummary()}
      {stage === 'fatal' && renderFatal()}
      {renderFooter()}

      <Box marginTop={1} borderStyle="single" borderColor={COLORS.muted} paddingX={1}>
        <Text color={COLORS.muted}>cwd :: {path.resolve(context.cwd)}</Text>
      </Box>
    </Box>
  );
};
