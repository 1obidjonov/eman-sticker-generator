import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ReleaseArtifactEngine,
  type ReleaseArtifactOptions,
} from '../src/core/release/index.js';

const temporaryDirectories: string[] = [];
const TEST_VERSION = '0.8.0-rc.1';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) =>
      rm(path, { recursive: true, force: true }),
    ),
  );
});

describe('ReleaseArtifactEngine', () => {
  it('creates and verifies a deterministic artifact manifest', async () => {
    const directory = await temporaryDirectory();
    const installerName = `Eman-Sticker-Generator-${TEST_VERSION}-x64.exe`;
    await Promise.all([
      writeFile(
        join(directory, installerName),
        Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62, 7)]),
      ),
      writeFile(
        join(directory, 'release-verification.json'),
        '{"status":"passed"}\n',
      ),
      writeFile(
        join(directory, 'sbom.cdx.json'),
        '{"bomFormat":"CycloneDX"}\n',
      ),
      writeFile(
        join(directory, 'windows-lifecycle-report.json'),
        '{"status":"passed"}\n',
      ),
    ]);
    const options = releaseOptions(directory);
    const engine = new ReleaseArtifactEngine();

    const manifest = await engine.finalize(options);
    const verification = await engine.verify(options);
    const checksums = await readFile(
      join(directory, 'checksums.sha256'),
      'utf8',
    );

    expect(manifest.version).toBe(TEST_VERSION);
    expect(manifest.sourceRevision).toBe('0123456789abcdef');
    expect(manifest.artifacts.map((artifact) => artifact.fileName)).toEqual([
      installerName,
      'release-verification.json',
      'sbom.cdx.json',
      'windows-lifecycle-report.json',
    ]);
    expect(manifest.artifacts[0]).toMatchObject({
      role: 'installer',
      bytes: 64,
    });
    expect(checksums).toContain(installerName);
    expect(verification).toEqual({
      artifacts: 4,
      bytes: 130,
      installerVerified: true,
    });
    expect(
      manifest.artifacts.find(
        (artifact) => artifact.fileName === 'windows-lifecycle-report.json',
      )?.role,
    ).toBe('lifecycle-report');
  });

  it('detects an artifact changed after finalization', async () => {
    const directory = await temporaryDirectory();
    const installerPath = join(
      directory,
      `Eman-Sticker-Generator-${TEST_VERSION}-x64.exe`,
    );
    await writeFile(
      installerPath,
      Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62, 1)]),
    );
    const options = releaseOptions(directory);
    const engine = new ReleaseArtifactEngine();
    await engine.finalize(options);

    await writeFile(
      installerPath,
      Buffer.concat([Buffer.from('MZ'), Buffer.alloc(62, 2)]),
    );

    await expect(engine.verify(options)).rejects.toThrow(
      'не соответствует манифесту',
    );
  });

  it('rejects a missing required Windows installer', async () => {
    const directory = await temporaryDirectory();
    await writeFile(
      join(directory, 'release-verification.json'),
      '{"status":"passed"}\n',
    );

    await expect(
      new ReleaseArtifactEngine().finalize(releaseOptions(directory)),
    ).rejects.toThrow('Не найден обязательный установщик');
  });
});

function releaseOptions(directory: string): ReleaseArtifactOptions {
  return {
    releaseDirectory: directory,
    productName: 'Eman Sticker Generator',
    version: TEST_VERSION,
    requireWindowsInstaller: true,
    minimumInstallerBytes: 32,
    sourceRevision: '0123456789abcdef',
    buildPlatform: 'win32',
    buildArchitecture: 'x64',
    codeSigning: 'signed',
  };
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sticker-release-'));
  temporaryDirectories.push(directory);
  return directory;
}
