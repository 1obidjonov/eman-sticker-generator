import { mkdir, rename, writeFile } from 'node:fs/promises';
import { isAbsolute, dirname } from 'node:path';

const DEFAULT_TIMEOUT_MS = 20_000;
const MINIMUM_TIMEOUT_MS = 1_000;
const MAXIMUM_TIMEOUT_MS = 60_000;

export interface SmokeTestRequest {
  outputPath: string;
  timeoutMs: number;
  userDataPath: string | null;
}

export interface SmokeTestCheck {
  name: string;
  status: 'passed' | 'failed';
  detail: string;
}

export interface SmokeTestReport {
  schemaVersion: 1;
  generatedAt: string;
  status: 'passed' | 'failed';
  productName: string;
  version: string;
  packaged: boolean;
  platform: string;
  architecture: string;
  checks: SmokeTestCheck[];
}

export function parseSmokeTestRequest(
  argumentsList: string[],
): SmokeTestRequest | null {
  if (!argumentsList.includes('--smoke-test')) {
    return null;
  }

  const outputPath = optionValue(argumentsList, '--smoke-output');
  if (!outputPath) {
    throw new Error(
      'Smoke-test требует абсолютный путь --smoke-output=<file.json>.',
    );
  }
  if (!isAbsolute(outputPath) || !outputPath.toLowerCase().endsWith('.json')) {
    throw new Error(
      'Путь smoke-отчёта должен быть абсолютным JSON-файлом.',
    );
  }

  const timeoutValue = optionValue(argumentsList, '--smoke-timeout-ms');
  const timeoutMs = timeoutValue
    ? Number(timeoutValue)
    : DEFAULT_TIMEOUT_MS;
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < MINIMUM_TIMEOUT_MS ||
    timeoutMs > MAXIMUM_TIMEOUT_MS
  ) {
    throw new Error(
      `Smoke timeout должен быть от ${MINIMUM_TIMEOUT_MS} до ${MAXIMUM_TIMEOUT_MS} мс.`,
    );
  }

  const userDataPath = optionValue(
    argumentsList,
    '--smoke-user-data-dir',
  );
  if (userDataPath && !isAbsolute(userDataPath)) {
    throw new Error(
      'Путь профиля smoke-теста должен быть абсолютным.',
    );
  }

  return { outputPath, timeoutMs, userDataPath };
}

export async function writeSmokeTestReport(
  outputPath: string,
  report: SmokeTestReport,
): Promise<void> {
  if (!isAbsolute(outputPath) || !outputPath.toLowerCase().endsWith('.json')) {
    throw new Error('Некорректный путь smoke-отчёта.');
  }
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  await rename(temporaryPath, outputPath);
}

function optionValue(
  argumentsList: string[],
  optionName: string,
): string | null {
  const inlinePrefix = `${optionName}=`;
  const inline = argumentsList.find((argument) =>
    argument.startsWith(inlinePrefix),
  );
  if (inline) {
    return inline.slice(inlinePrefix.length).trim() || null;
  }

  const index = argumentsList.indexOf(optionName);
  if (index < 0) {
    return null;
  }
  const value = argumentsList[index + 1];
  if (!value || value.startsWith('--')) {
    return null;
  }
  return value.trim() || null;
}
