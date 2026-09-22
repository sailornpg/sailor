#!/usr/bin/env node
import path from 'node:path';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';

const ALLOWED_STATUSES = new Set(['blocked', 'done', 'cancelled']);
const HARNESS_DIR = '.agent-harness';
const FEATURE_LIST_PATH = '.agent-harness/feature_list.json';
const PROGRESS_PATH = '.agent-harness/progress.md';
const ARCHIVE_INDEX_PATH = '.agent-harness/archive/index.json';

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.featureId) {
  printHelp(args.help ? 0 : 1);
}

const featureListPath = path.resolve(process.cwd(), FEATURE_LIST_PATH);
const progressPath = path.resolve(process.cwd(), PROGRESS_PATH);
const archiveRoot = path.resolve(process.cwd(), HARNESS_DIR, 'archive');
const archiveIndexPath = path.resolve(process.cwd(), ARCHIVE_INDEX_PATH);
const archiveDir = path.join(archiveRoot, args.featureId);
const archiveFeatureListPath = path.join(archiveDir, 'feature_list.json');
const archiveProgressPath = path.join(archiveDir, 'progress.md');

const featureList = await readJson(featureListPath);
if (!Array.isArray(featureList.features)) {
  fail(`Invalid feature list at ${FEATURE_LIST_PATH}: missing "features" array.`);
}

const feature = featureList.features.find((candidate) => candidate?.id === args.featureId);
if (!feature) {
  fail(`Feature "${args.featureId}" was not found in ${FEATURE_LIST_PATH}.`);
}

if (!ALLOWED_STATUSES.has(feature.status)) {
  fail(
    `Feature "${args.featureId}" has status "${feature.status}". `
      + `Only ${[...ALLOWED_STATUSES].join(', ')} can be archived.`
  );
}

if (await exists(archiveDir)) {
  fail(`Archive target already exists: ${toRelative(archiveDir)}.`);
}

const progressExists = await exists(progressPath);
const rootProgress = progressExists ? await readText(progressPath) : '';
const activeFeatureId = rootProgress ? extractActiveFeatureId(rootProgress, featureList.features) : null;
const isActiveFeature = activeFeatureId === args.featureId;
const archivedAt = new Date().toISOString();
const displayName = getFeatureName(feature);

await mkdir(archiveDir, { recursive: false });

await writeJson(archiveFeatureListPath, { features: [feature] });
await writeText(
  archiveProgressPath,
  isActiveFeature
    ? rootProgress
    : buildSyntheticArchiveProgress(feature, { archivedAt, activeFeatureId })
);

const remainingFeatures = featureList.features.filter((candidate) => candidate?.id !== args.featureId);
await writeJson(featureListPath, {
  ...featureList,
  features: remainingFeatures
});

if (isActiveFeature) {
  await writeText(progressPath, buildResetProgressTemplate(archivedAt));
}

const archiveIndex = await loadArchiveIndex(archiveIndexPath);
archiveIndex.archives.push({
  id: args.featureId,
  title: displayName,
  status: feature.status,
  archived_at: archivedAt,
  archive_path: toPosix(path.join(HARNESS_DIR, 'archive', args.featureId))
});
await writeJson(archiveIndexPath, archiveIndex);

console.log(`Archived ${args.featureId} (${displayName})`);
console.log(`Archive snapshot: ${toRelative(archiveDir)}`);
console.log(`Archive index: ${ARCHIVE_INDEX_PATH}`);
if (isActiveFeature) {
  console.log(`Root progress reset: ${PROGRESS_PATH}`);
} else {
  console.log(`Root progress left unchanged: ${PROGRESS_PATH}`);
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      parsed._.push(token);
      continue;
    }
    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      parsed[key] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
      parsed[key] = argv[index + 1];
      index += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

function printHelp(exitCode) {
  console.log(`Usage: node ${toPosix(path.join(HARNESS_DIR, 'scripts', 'archive-feature.mjs'))} --feature-id <feature-id>

Archive a blocked, done, or cancelled feature into ${toPosix(path.join(HARNESS_DIR, 'archive'))}/<feature-id>/.

This command:
  - snapshots the feature entry into archive/<feature-id>/feature_list.json
  - snapshots progress into archive/<feature-id>/progress.md
  - updates ${ARCHIVE_INDEX_PATH}
  - removes the feature from ${FEATURE_LIST_PATH}
  - resets ${PROGRESS_PATH} only when archiving the active feature
`);
  process.exit(exitCode);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readText(filePath) {
  return readFile(filePath, 'utf8');
}

async function readJson(filePath) {
  return JSON.parse(await readText(filePath));
}

async function writeJson(filePath, value) {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeText(filePath, contents) {
  await writeFile(filePath, contents, 'utf8');
}

async function loadArchiveIndex(filePath) {
  if (!await exists(filePath)) {
    return { archives: [] };
  }
  const parsed = await readJson(filePath);
  if (!Array.isArray(parsed.archives)) {
    return { archives: [] };
  }
  return parsed;
}

function buildResetProgressTemplate(lastUpdated) {
  return `# Session Progress Log

## Current State

**Last Updated:** ${lastUpdated}
**Session ID:** [optional]
**Active Feature:** [none]

## Status

### 已完成

- [ ] No active feature selected

### 进行中

- [ ] Waiting for the next unarchived feature
  - Details: Select the next unarchived feature from \`${FEATURE_LIST_PATH}\`
  - Blockers: none

### 下一步

1. Select the next unarchived feature from \`${FEATURE_LIST_PATH}\`
2. Update this file when the next active feature starts

## Blockers / Risks

- [ ] None currently

## Decisions Made

- **Active feature archived**: Reset the root progress panel after archiving the current feature
  - Context: Historical detail now lives under \`${ARCHIVE_INDEX_PATH}\`
  - Alternatives considered: Keep all historical detail in the root progress file

## Files Modified This Session

- \`${PROGRESS_PATH}\` - reset after archiving the active feature
- \`${ARCHIVE_INDEX_PATH}\` - archive index updated

## Evidence of Completion

- [ ] Archive command executed successfully

## Notes for Next Session

Start the next active feature and replace this placeholder state with real progress notes.
`;
}

function buildSyntheticArchiveProgress(feature, { archivedAt, activeFeatureId }) {
  const knownKeys = new Set([
    'id',
    'name',
    'title',
    'description',
    'status',
    'dependencies',
    'evidence'
  ]);
  const remainingFields = Object.fromEntries(
    Object.entries(feature).filter(([key]) => !knownKeys.has(key))
  );
  const dependencies = Array.isArray(feature.dependencies) && feature.dependencies.length
    ? feature.dependencies.map((dependency) => `- ${dependency}`).join('\n')
    : '- none';
  const evidence = feature.evidence ? feature.evidence : 'No evidence recorded in the feature entry.';
  const extraFields = Object.keys(remainingFields).length
    ? `\n## Additional Fields Snapshot\n\n\`\`\`json\n${JSON.stringify(remainingFields, null, 2)}\n\`\`\`\n`
    : '';

  return `# Archived Feature Progress

## Archived Metadata

**Archived At:** ${archivedAt}
**Feature ID:** ${feature.id}
**Feature Name:** ${getFeatureName(feature)}
**Archived Status:** ${feature.status}
**Archive Source:** \`${FEATURE_LIST_PATH}\`
**Active Feature At Archive Time:** ${activeFeatureId ?? 'none detected'}

## Archive Note

This feature was not the active progress panel at archive time.
This archive progress file is a structured summary synthesized from \`${FEATURE_LIST_PATH}\`.

## Feature Summary

${feature.description || 'No description recorded.'}

## Dependencies

${dependencies}

## Evidence

${evidence}
${extraFields}`;
}

function extractActiveFeatureId(progressContents, features) {
  const explicitMatch = progressContents.match(/\*\*Active Feature:\*\*\s*\[([^\]\s]+)/i);
  if (explicitMatch?.[1]) {
    return explicitMatch[1];
  }

  const strongHeadingMatch = progressContents.match(/^\*\*([^*\n]+)\*\*\s*[—-]/m);
  if (strongHeadingMatch?.[1]) {
    return strongHeadingMatch[1].trim();
  }

  for (const feature of features) {
    if (feature?.id && progressContents.includes(feature.id)) {
      return feature.id;
    }
  }

  return null;
}

function getFeatureName(feature) {
  return feature.title || feature.name || feature.id;
}

function toRelative(filePath) {
  return toPosix(path.relative(process.cwd(), filePath) || '.');
}

function toPosix(value) {
  return String(value).replaceAll(path.sep, '/');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
