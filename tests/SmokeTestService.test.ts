import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  parseSmokeTestRequest,
  writeSmokeTestReport,
  type SmokeTestReport,
} from '../src/main/services/SmokeTestService.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe('SmokeTestService', () => {
  it('ignores a regular application launch', () => {
    expect(parseSmokeTestRequest(['EmanStickerGenerator.exe'])).toBeNull();
  });

  it('accepts inline and separate smoke options', () => {
    const outputPath = join(tmpdir(), 'eman-smoke.json');

    expect(
      parseSmokeTestRequest([
        '--smoke-test',
        `--smoke-output=${outputPath}`,
        '--smoke-timeout-ms',
        '15000',
      ]),
    ).toEqual({
      outputPath,
      timeoutMs: 15_000,
      userDataPath: null,
    });
  });

  it('accepts smoke options from a packaged-process environment', () => {
    const outputPath = join(tmpdir(), 'eman-env-smoke.json');
    const userDataPath = join(tmpdir(), 'eman-env-smoke-profile');

    expect(
      parseSmokeTestRequest(['EmanStickerGenerator.exe'], {
        STICKER_SMOKE_TEST: '1',
        STICKER_SMOKE_OUTPUT: ` ${outputPath} `,
        STICKER_SMOKE_TIMEOUT_MS: '30000',
        STICKER_SMOKE_USER_DATA_DIR: userDataPath,
      }),
    ).toEqual({
      outputPath,
      timeoutMs: 30_000,
      userDataPath,
    });
  });

  it('prefers explicit command-line options over the environment', () => {
    const argumentOutput = join(tmpdir(), 'argument-smoke.json');
    const environmentOutput = join(tmpdir(), 'environment-smoke.json');

    expect(
      parseSmokeTestRequest(
        [
          '--smoke-test',
          `--smoke-output=${argumentOutput}`,
          '--smoke-timeout-ms=15000',
        ],
        {
          STICKER_SMOKE_TEST: '1',
          STICKER_SMOKE_OUTPUT: environmentOutput,
          STICKER_SMOKE_TIMEOUT_MS: '30000',
        },
      ),
    ).toEqual({
      outputPath: argumentOutput,
      timeoutMs: 15_000,
      userDataPath: null,
    });
  });

  it('rejects a relative report path and an unsafe timeout', () => {
    expect(() =>
      parseSmokeTestRequest([
        '--smoke-test',
        '--smoke-output=report.json',
      ]),
    ).toThrow('абсолютным');

    expect(() =>
      parseSmokeTestRequest([
        '--smoke-test',
        `--smoke-output=${join(tmpdir(), 'report.json')}`,
        '--smoke-timeout-ms=100',
      ]),
    ).toThrow('Smoke timeout');

    expect(() =>
      parseSmokeTestRequest([
        '--smoke-test',
        `--smoke-output=${join(tmpdir(), 'report.json')}`,
        '--smoke-user-data-dir=relative-profile',
      ]),
    ).toThrow('Путь профиля');
  });

  it('accepts an isolated absolute user-data directory', () => {
    const outputPath = join(tmpdir(), 'eman-smoke.json');
    const userDataPath = join(tmpdir(), 'eman-smoke-profile');

    expect(
      parseSmokeTestRequest([
        '--smoke-test',
        `--smoke-output=${outputPath}`,
        `--smoke-user-data-dir=${userDataPath}`,
      ]),
    ).toEqual({
      outputPath,
      timeoutMs: 20_000,
      userDataPath,
    });
  });

  it('writes the report atomically as formatted JSON', async () => {
    const directory = await temporaryDirectory();
    const outputPath = join(directory, 'nested', 'smoke.json');
    const report: SmokeTestReport = {
      schemaVersion: 1,
      generatedAt: '2026-07-29T00:00:00.000Z',
      status: 'passed',
      productName: 'Eman Sticker Generator',
      version: '0.8.0-rc.1',
      packaged: true,
      platform: 'win32',
      architecture: 'x64',
      checks: [
        {
          name: 'Renderer',
          status: 'passed',
          detail: 'loaded',
        },
      ],
    };

    await writeSmokeTestReport(outputPath, report);

    expect(JSON.parse(await readFile(outputPath, 'utf8'))).toEqual(report);
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sticker-smoke-'));
  temporaryDirectories.push(directory);
  return directory;
}
