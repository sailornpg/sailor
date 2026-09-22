#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const FEATURE_LIST_PATH = '.agent-harness/feature_list.json';
const COVERAGE_VALUES = new Set(['unit', 'integration', 'e2e', 'static', 'manual-exception']);

const args = parseArgs(process.argv.slice(2));
const root = process.cwd();
const featureListPath = path.join(root, FEATURE_LIST_PATH);

if (args.invalid) {
  fail(args.invalid);
}

const featureList = JSON.parse(await readFile(featureListPath, 'utf8'));

if (args.validate) {
  runValidateOnly(featureList.features ?? [], args.featureId);
}

const feature = selectFeature(featureList.features ?? [], args.featureId);

if (!feature) {
  fail(`No feature found${args.featureId ? ` for ${args.featureId}` : ''}.`);
}

if (!Array.isArray(feature.checklist) || feature.checklist.length === 0) {
  fail(`${feature.id} has no checklist items.`);
}

const selectedItems = args.all
  ? feature.checklist.map((item, index) => ({ item, index }))
  : [selectItem(feature.checklist, args.item)];

let failed = false;

for (const selected of selectedItems) {
  const { item, index } = selected;
  if (!item) {
    fail(`Checklist item ${args.item} not found.`);
  }
  if (item.status === 'done') {
    console.log(`SKIP ${feature.id} #${index + 1}: already done`);
    continue;
  }

  const validation = validateChecklistItem(item, { allowLegacy: true });
  if (!validation.valid) {
    fail(`${feature.id} #${index + 1}: ${validation.errors.join('; ')}`);
  }
  for (const warning of validation.warnings) {
    console.warn(`WARN ${feature.id} #${index + 1}: ${warning}`);
  }

  const testCommand = normalizeOptionalCommand(item.test);
  if (testCommand) {
    console.log(`=== test ${feature.id} #${index + 1} ===`);
    console.log(testCommand);
    const testEvidence = runCommand(testCommand);

    if (testEvidence.exitCode !== 0) {
      item.lastFailure = { stage: 'test', ...testEvidence };
      failed = true;
      console.error(`FAIL ${feature.id} #${index + 1}: test`);
      continue;
    }

    item.testEvidence = testEvidence;
  }

  const verifyCommands = normalizeCommands(item.verify);
  const verifyEvidenceList = [];
  let verifyFailed = false;

  for (const [commandIndex, command] of verifyCommands.entries()) {
    console.log(`=== verify ${feature.id} #${index + 1}.${commandIndex + 1} ===`);
    console.log(command);
    const evidence = runCommand(command);
    verifyEvidenceList.push(evidence);

    if (evidence.exitCode !== 0) {
      item.lastFailure = { stage: 'verify', commandIndex: commandIndex + 1, ...evidence };
      failed = true;
      verifyFailed = true;
      console.error(`FAIL ${feature.id} #${index + 1}: verify #${commandIndex + 1}`);
      break;
    }
  }

  if (verifyFailed) continue;

  item.status = 'done';
  if (verifyCommands.length === 1) {
    item.verifyEvidence = verifyEvidenceList[0];
    item.evidence = verifyEvidenceList[0];
    delete item.verifyEvidenceList;
  } else {
    item.verifyEvidenceList = verifyEvidenceList;
    item.evidence = {
      command: verifyCommands.join(' && '),
      verifiedAt: verifyEvidenceList.at(-1)?.verifiedAt ?? new Date().toISOString(),
      exitCode: 0,
      stdout: trimOutput(verifyEvidenceList.map((entry) => entry.stdout).filter(Boolean).join('\n')),
      stderr: trimOutput(verifyEvidenceList.map((entry) => entry.stderr).filter(Boolean).join('\n'))
    };
    delete item.verifyEvidence;
  }
  delete item.lastFailure;
  console.log(`PASS ${feature.id} #${index + 1}`);
}

recomputeFeatureStatus(feature);

await writeFile(featureListPath, `${JSON.stringify(featureList, null, 2)}\n`, 'utf8');

if (failed) {
  process.exitCode = 1;
}

function validateChecklistItem(item, { allowLegacy = false } = {}) {
  const errors = [];
  const warnings = [];

  if (typeof item.action !== 'string' || !item.action.trim()) errors.push('missing action');
  if (!['not-started', 'done'].includes(item.status)) errors.push('status must be not-started or done');

  const verifyCommands = normalizeCommands(item.verify);
  if (verifyCommands.length === 0) {
    errors.push('missing verify command');
  } else {
    for (const command of verifyCommands) {
      if (!isExecutableVerify(command)) errors.push(`invalid verify command: ${command}`);
    }
  }

  const isLegacy = item.coverage === undefined;
  if (isLegacy) {
    if (allowLegacy) warnings.push('legacy checklist item has no coverage metadata; migrate before using /harness-action');
    else errors.push('missing coverage');
    return { valid: errors.length === 0, errors, warnings };
  }

  if (!COVERAGE_VALUES.has(item.coverage)) errors.push(`invalid coverage: ${item.coverage}`);

  const tddEnabled = item.tdd !== false;
  const testCommand = normalizeOptionalCommand(item.test);
  if ((item.coverage === 'unit' || tddEnabled) && !testCommand) {
    errors.push('missing test command for unit/TDD item');
  }
  if (testCommand && !isExecutableTest(testCommand)) {
    errors.push(`invalid test command: ${testCommand}`);
  }

  if ((item.coverage === 'static' || item.coverage === 'manual-exception' || item.tdd === false)
    && (typeof item.coverage_reason !== 'string' || !item.coverage_reason.trim())) {
    errors.push('missing coverage_reason');
  }

  return { valid: errors.length === 0, errors, warnings };
}

// 创建期 schema 校验：只读校验，不执行 verify 命令、不修改 feature_list。
function runValidateOnly(features, featureId) {
  const targets = featureId ? features.filter((candidate) => candidate.id === featureId) : features;
  if (featureId && targets.length === 0) {
    fail(`No feature found for ${featureId}.`);
  }

  let problems = 0;
  for (const feature of targets) {
    for (const docError of validateFeatureDocFields(feature)) {
      console.error(`INVALID ${feature.id}: ${docError}`);
      problems += 1;
    }
    if (!Array.isArray(feature.checklist) || feature.checklist.length === 0) {
      console.error(`INVALID ${feature.id}: checklist 不能为空`);
      problems += 1;
      continue;
    }
    feature.checklist.forEach((item, index) => {
      const validation = validateChecklistItem(item, { allowLegacy: false });
      for (const error of validation.errors) {
        console.error(`INVALID ${feature.id} #${index + 1}: ${error}`);
        problems += 1;
      }
      for (const warning of validation.warnings) {
        console.warn(`WARN ${feature.id} #${index + 1}: ${warning}`);
      }
    });
  }

  if (problems === 0) {
    console.log(`OK: ${targets.length} 个 feature 通过 checklist schema 校验。`);
    process.exit(0);
  }
  console.error(`\n发现 ${problems} 处问题。`);
  process.exit(1);
}

// 四个文档字段可选；出现时必须是非空字符串或非空字符串数组。
function validateFeatureDocFields(feature) {
  const errors = [];
  for (const field of ['prd_spec', 'trd_spec', 'interface_spec', 'test_case_spec']) {
    const value = feature[field];
    if (value === undefined || value === null) continue;
    const entries = Array.isArray(value) ? value : [value];
    if (entries.length === 0) {
      errors.push(`${field} 不能是空数组`);
      continue;
    }
    if (!entries.every((entry) => typeof entry === 'string' && entry.trim())) {
      errors.push(`${field} 必须是非空字符串或非空字符串数组`);
    }
  }
  return errors;
}

function recomputeFeatureStatus(featureToUpdate) {
  if (!Array.isArray(featureToUpdate.checklist) || featureToUpdate.checklist.length === 0) {
    featureToUpdate.status = 'blocked';
    delete featureToUpdate.evidence;
    return;
  }
  if (featureToUpdate.checklist.every((item) => item.status === 'done')) {
    featureToUpdate.status = 'done';
    featureToUpdate.evidence = `Verified by ${FEATURE_LIST_PATH} checklist at ${new Date().toISOString()}`;
    return;
  }
  if (featureToUpdate.status === 'done') {
    delete featureToUpdate.evidence;
  }
  featureToUpdate.status = 'in-progress';
}

function parseArgs(argv) {
  const parsed = { all: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--feature-id') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        parsed.invalid = '--feature-id requires a value';
        return parsed;
      }
      parsed.featureId = argv[index + 1];
      index += 1;
    } else if (token === '--item') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) {
        parsed.invalid = '--item requires a 1-based numeric value';
        return parsed;
      }
      parsed.item = Number(argv[index + 1]);
      if (!Number.isInteger(parsed.item) || parsed.item <= 0) {
        parsed.invalid = '--item requires a 1-based numeric value';
        return parsed;
      }
      index += 1;
    } else if (token === '--all') {
      parsed.all = true;
    } else if (token === '--validate') {
      parsed.validate = true;
    } else if (token === '--help') {
      console.log('Usage: node ./.agent-harness/scripts/verify-feature.mjs --feature-id feat-001 --item 1\n       node ./.agent-harness/scripts/verify-feature.mjs --validate [--feature-id feat-001]  # 只校验 schema，不执行命令、不写文件');
      process.exit(0);
    }
  }
  return parsed;
}

function selectFeature(features, featureId) {
  if (featureId) return features.find((candidate) => candidate.id === featureId);
  return features.find((candidate) => candidate.status === 'in-progress')
    ?? features.find((candidate) => candidate.status === 'not-started');
}

function selectItem(checklist, itemNumber) {
  if (Number.isInteger(itemNumber) && itemNumber > 0) {
    return { item: checklist[itemNumber - 1], index: itemNumber - 1 };
  }
  const index = checklist.findIndex((item) => item.status !== 'done');
  return { item: checklist[index], index };
}

function normalizeCommands(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry ?? '').trim()).filter(Boolean);
  }
  const command = normalizeOptionalCommand(value);
  return command ? [command] : [];
}

function normalizeOptionalCommand(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function runCommand(command) {
  const result = spawnSync(command, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });

  return {
    command,
    verifiedAt: new Date().toISOString(),
    exitCode: result.status ?? 1,
    stdout: trimOutput(result.stdout),
    stderr: trimOutput(result.stderr)
  };
}

function isExecutableTest(value) {
  const command = String(value).trim();
  if (!isExecutableCommand(command)) return false;
  return /(^|\s|[;&|!])(\.\/|npm|pnpm|yarn|bun|npx|node|python|pytest|go|cargo|mvn|gradlew|dotnet|make)\b/.test(command)
    && /(test|spec|vitest|jest|pytest|unittest|node\s+--test|go\s+test|cargo\s+test|mvn\s+test|gradlew\s+test|dotnet\s+test|make\s+test)/i.test(command);
}

function isExecutableVerify(value) {
  return isExecutableCommand(value);
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

function trimOutput(value) {
  const text = String(value ?? '').trim();
  if (text.length <= 4000) return text;
  return `${text.slice(0, 4000)}\n... output truncated ...`;
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}
