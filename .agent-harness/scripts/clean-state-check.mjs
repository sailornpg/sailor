#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const HARNESS_DIR = '.agent-harness';
const FEATURE_LIST_PATH = '.agent-harness/feature_list.json';
const PROGRESS_PATH = '.agent-harness/progress.md';
const SESSION_HANDOFF_PATH = '.agent-harness/session-handoff.md';
const INIT_SCRIPT_PATH = '.agent-harness/init.sh';
const COVERAGE_VALUES = new Set(['unit', 'integration', 'e2e', 'static', 'manual-exception']);

const args = new Set(process.argv.slice(2));
const root = process.cwd();
const failures = [];
const warnings = [];

await mustExist(FEATURE_LIST_PATH, 'feature list exists');
await mustExist(PROGRESS_PATH, 'progress log exists');
await mustExist(INIT_SCRIPT_PATH, 'init script exists');

const activeFeatureId = await readActiveFeatureId();

await checkFeatureList(activeFeatureId);
await checkProgress();
await checkHandoff();
await checkTemporaryArtifacts();

if (!args.has('--skip-verification')) {
  const result = spawnSync(`./${INIT_SCRIPT_PATH}`, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    failures.push(`standard verification failed: ./${INIT_SCRIPT_PATH}`);
  }
}

if (warnings.length) {
  console.log('=== Clean-state warnings ===');
  for (const warning of warnings) console.log(`WARN ${warning}`);
}

if (failures.length) {
  console.error('=== Clean-state failed ===');
  for (const failure of failures) console.error(`FAIL ${failure}`);
  process.exit(1);
}

console.log('=== Clean-state passed ===');

async function mustExist(relativePath, label) {
  try {
    await access(path.join(root, relativePath));
  } catch {
    failures.push(`${label}: missing ${relativePath}`);
  }
}

async function checkFeatureList(activeFeatureId) {
  try {
    const featureList = JSON.parse(await readFile(path.join(root, FEATURE_LIST_PATH), 'utf8'));
    const features = Array.isArray(featureList.features) ? featureList.features : [];
    const active = features.filter((feature) => feature.status === 'in-progress');
    if (active.length > 1) failures.push('more than one feature is in-progress');
    for (const feature of features) {
      if (!Array.isArray(feature.checklist) || feature.checklist.length === 0) {
        failures.push(`${feature.id ?? '<unknown>'}: missing checklist`);
        continue;
      }
      for (const [index, item] of feature.checklist.entries()) {
        for (const error of validateChecklistItem(item)) {
          failures.push(`${feature.id} #${index + 1}: ${error}`);
        }
        if (item.status === 'done' && !hasVerifierEvidence(item)) {
          if (feature.id === activeFeatureId) {
            failures.push(`${feature.id} #${index + 1}: current feature done without verifier evidence`);
          } else {
            warnings.push(`${feature.id} #${index + 1}: legacy done item without evidence`);
          }
        }
      }
    }
  } catch (error) {
    failures.push(`feature list invalid: ${error.message}`);
  }
}

function validateChecklistItem(item) {
  const errors = [];
  if (typeof item.action !== 'string' || !item.action.trim()) errors.push('missing action');
  if (!['not-started', 'done'].includes(item.status)) errors.push('status must be not-started or done');

  const verifyCommands = normalizeCommands(item.verify);
  if (verifyCommands.length === 0) {
    errors.push('missing verify command');
  } else {
    for (const command of verifyCommands) {
      if (!isExecutableCommand(command)) errors.push(`invalid verify command: ${command}`);
    }
  }

  if (item.coverage === undefined) {
    errors.push('missing coverage metadata');
    return errors;
  }

  if (!COVERAGE_VALUES.has(item.coverage)) errors.push(`invalid coverage: ${item.coverage}`);

  const tddEnabled = item.tdd !== false;
  const testCommand = typeof item.test === 'string' ? item.test.trim() : '';
  if ((item.coverage === 'unit' || tddEnabled) && !testCommand) {
    errors.push('missing test command for unit/TDD item');
  }
  if (testCommand && !isExecutableTest(testCommand)) errors.push(`invalid test command: ${testCommand}`);

  if ((item.coverage === 'static' || item.coverage === 'manual-exception' || item.tdd === false)
    && (typeof item.coverage_reason !== 'string' || !item.coverage_reason.trim())) {
    errors.push('missing coverage_reason');
  }

  return errors;
}

function hasVerifierEvidence(item) {
  return Boolean(item.evidence || item.verifyEvidence || item.verifyEvidenceList || item.testEvidence);
}

function normalizeCommands(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function isExecutableTest(value) {
  const command = String(value).trim();
  if (!isExecutableCommand(command)) return false;
  return /(^|\s|[;&|!])(\.\/|npm|pnpm|yarn|bun|npx|node|python|pytest|go|cargo|mvn|gradlew|dotnet|make)\b/.test(command)
    && /(test|spec|vitest|jest|pytest|unittest|node\s+--test|go\s+test|cargo\s+test|mvn\s+test|gradlew\s+test|dotnet\s+test|make\s+test)/i.test(command);
}

function isExecutableCommand(value) {
  const command = String(value).trim();
  if (!command) return false;
  if (/\|\|\s*true\b|&&\s*true\b|;\s*true\b/.test(command)) return false;
  if (/^(确认|检查|验证|测试).*(正常|通过|可用)$/.test(command)) return false;
  if (/^(manual|手动|人工|n\/a|none)$/i.test(command)) return false;
  if (/(无匹配|无报错|仅剩|预期|确认|检查|运行|应该|must|should)/i.test(command)) return false;
  return /(^|\s|[;&|!])(\.\/|npm|pnpm|yarn|bun|npx|uv|poetry|turbo|nx|node|python|pytest|go|cargo|mvn|gradlew|dotnet|ReadLints|rg|test|vue-tsc|tsc|eslint|vitest|jest|playwright|curl|docker|make)\b/.test(command);
}

async function readActiveFeatureId() {
  try {
    const progress = await readFile(path.join(root, PROGRESS_PATH), 'utf8');
    return progress.match(/\*\*(feat-\d+)\*\*/)?.[1] ?? null;
  } catch {
    return null;
  }
}

async function checkProgress() {
  try {
    const progress = await readFile(path.join(root, PROGRESS_PATH), 'utf8');
    for (const needle of ['Active Feature', 'Checklist', '验证']) {
      if (!progress.includes(needle)) warnings.push(`${PROGRESS_PATH} may be missing ${needle}`);
    }
  } catch {
    // Already reported by mustExist.
  }
}

async function checkHandoff() {
  try {
    const handoff = await readFile(path.join(root, SESSION_HANDOFF_PATH), 'utf8');
    for (const needle of ['Current Objective', 'Verification Evidence', 'Files Changed', 'Recommended Next Step']) {
      if (!handoff.includes(needle)) warnings.push(`${SESSION_HANDOFF_PATH} may be missing ${needle}`);
    }
  } catch {
    warnings.push(`${SESSION_HANDOFF_PATH} not found; create it before long pauses or agent handoff`);
  }
}

async function checkTemporaryArtifacts() {
  const matches = [];
  await walk(root, '', matches);
  if (matches.length) {
    failures.push(`temporary/debug artifacts found: ${matches.slice(0, 10).join(', ')}`);
  }
}

async function walk(current, relative, matches) {
  if (matches.length >= 20) return;
  let entries = [];
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (['.git', 'node_modules', 'dist', 'build', '.next', HARNESS_DIR.replace(/^\.\//, '')].includes(entry.name)) continue;
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walk(full, rel, matches);
    } else if (isTemporaryArtifact(entry.name)) {
      matches.push(rel);
    }
  }
}

function isTemporaryArtifact(name) {
  return /(^debug-|\.tmp$|\.bak$|\.orig$|\.rej$|\.log$)/.test(name);
}
