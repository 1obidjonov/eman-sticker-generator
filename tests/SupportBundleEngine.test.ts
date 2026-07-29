import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  sanitizeSupportLog,
  SupportBundleEngine,
  type SupportBundleOptions,
} from '../src/core/support/index.js';
import { DEFAULT_APP_SETTINGS } from '../src/shared/ipc-contract.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe('SupportBundleEngine', () => {
  it('creates a diagnostics ZIP with the expected safe sections', async () => {
    const directory = await temporaryDirectory();
    const logPath = join(directory, 'application.log');
    const outputPath = join(directory, 'support.zip');
    await writeFile(logPath, '{"event":"application.start"}\n', 'utf8');
    const options = supportOptions(outputPath, [logPath]);

    const result = await new SupportBundleEngine().create(options);
    const archive = await readFile(outputPath);

    expect(archive.subarray(0, 2).toString()).toBe('PK');
    expect(archive.includes(Buffer.from('diagnostics.json'))).toBe(true);
    expect(archive.includes(Buffer.from('settings.json'))).toBe(true);
    expect(archive.includes(Buffer.from('README.txt'))).toBe(true);
    expect(archive.includes(Buffer.from('logs/application.log'))).toBe(true);
    expect(result.path).toBe(outputPath);
    expect(result.bytes).toBe(archive.byteLength);
  });

  it('redacts profile paths, custom browser paths and secret query values', () => {
    const options = supportOptions('/tmp/support.zip', []);
    const sanitized = sanitizeSupportLog(
      'file=/home/alice/.config/eman/log token=https://x.test?a=1&token=secret ' +
        'browser=/opt/private/chrome other=/home/bob/source',
      options,
    );

    expect(sanitized).not.toContain('alice');
    expect(sanitized).not.toContain('bob');
    expect(sanitized).not.toContain('/opt/private/chrome');
    expect(sanitized).not.toContain('secret');
    expect(sanitized).toContain('<userData>');
    expect(sanitized).toContain('<home>');
    expect(sanitized).toContain('<customBrowser>');
    expect(sanitized).toContain('token=[redacted]');
  });

  it('rejects a non-ZIP output path', async () => {
    const directory = await temporaryDirectory();
    await expect(
      new SupportBundleEngine().create(
        supportOptions(join(directory, 'support.txt'), []),
      ),
    ).rejects.toThrow('ZIP-архивом');
  });
});

function supportOptions(
  outputPath: string,
  logFiles: string[],
): SupportBundleOptions {
  return {
    outputPath,
    diagnostics: {
      appVersion: '0.8.0-rc.1',
      electronVersion: '37.0.0',
      chromiumVersion: '138.0.0',
      nodeVersion: process.versions.node,
      platform: process.platform,
      architecture: process.arch,
      templatesPath: '/home/alice/.config/eman/templates',
      userDataPath: '/home/alice/.config/eman',
      parserCount: 1,
      browser: {
        status: 'ready',
        version: 'Chromium 138',
        launchDurationMs: 420,
      },
    },
    settings: {
      ...structuredClone(DEFAULT_APP_SETTINGS),
      browserExecutablePath: '/opt/private/chrome',
    },
    logFiles,
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sticker-support-'));
  temporaryDirectories.push(directory);
  return directory;
}
