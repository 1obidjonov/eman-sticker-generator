import { createReadStream } from 'node:fs';
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';

export const RELEASE_MANIFEST_NAME = 'release-manifest.json';
export const RELEASE_CHECKSUMS_NAME = 'checksums.sha256';

export type ReleaseArtifactRole =
  | 'installer'
  | 'portable'
  | 'package'
  | 'sbom'
  | 'smoke-report'
  | 'lifecycle-report'
  | 'verification'
  | 'update-metadata';

export interface ReleaseArtifactRecord {
  fileName: string;
  role: ReleaseArtifactRole;
  bytes: number;
  sha256: string;
}

export interface ReleaseManifest {
  schemaVersion: 1;
  generatedAt: string;
  productName: string;
  version: string;
  sourceRevision: string | null;
  build: {
    platform: string;
    architecture: string;
    codeSigning: 'signed' | 'unsigned' | 'not-checked';
  };
  artifacts: ReleaseArtifactRecord[];
}

export interface ReleaseArtifactOptions {
  releaseDirectory: string;
  productName: string;
  version: string;
  requireWindowsInstaller?: boolean;
  minimumInstallerBytes?: number;
  sourceRevision?: string | null;
  buildPlatform?: string;
  buildArchitecture?: string;
  codeSigning?: 'signed' | 'unsigned' | 'not-checked';
}

export interface ReleaseArtifactVerification {
  artifacts: number;
  bytes: number;
  installerVerified: boolean;
}

export class ReleaseArtifactEngine {
  async finalize(
    options: ReleaseArtifactOptions,
  ): Promise<ReleaseManifest> {
    const normalized = normalizeOptions(options);
    await mkdir(normalized.releaseDirectory, { recursive: true });
    const artifacts = await collectArtifacts(normalized);
    await assertRequiredInstaller(artifacts, normalized);

    const manifest: ReleaseManifest = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      productName: normalized.productName,
      version: normalized.version,
      sourceRevision: normalizeRevision(normalized.sourceRevision),
      build: {
        platform: normalized.buildPlatform,
        architecture: normalized.buildArchitecture,
        codeSigning: normalized.codeSigning,
      },
      artifacts,
    };

    await Promise.all([
      atomicWrite(
        join(normalized.releaseDirectory, RELEASE_MANIFEST_NAME),
        `${JSON.stringify(manifest, null, 2)}\n`,
      ),
      atomicWrite(
        join(normalized.releaseDirectory, RELEASE_CHECKSUMS_NAME),
        checksumDocument(artifacts),
      ),
    ]);
    await this.verify(normalized);
    return manifest;
  }

  async verify(
    options: ReleaseArtifactOptions,
  ): Promise<ReleaseArtifactVerification> {
    const normalized = normalizeOptions(options);
    const manifest = JSON.parse(
      await readFile(
        join(normalized.releaseDirectory, RELEASE_MANIFEST_NAME),
        'utf8',
      ),
    ) as ReleaseManifest;
    assertManifestMetadata(manifest, normalized);

    const actualArtifacts = await collectArtifacts(normalized);
    const expectedNames = manifest.artifacts
      .map((artifact) => artifact.fileName)
      .sort();
    const actualNames = actualArtifacts
      .map((artifact) => artifact.fileName)
      .sort();
    if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
      throw new Error(
        'Состав файлов релиза отличается от release-manifest.json.',
      );
    }

    for (const artifact of manifest.artifacts) {
      assertSafeFileName(artifact.fileName);
      const actual = actualArtifacts.find(
        (candidate) => candidate.fileName === artifact.fileName,
      );
      if (
        !actual ||
        actual.bytes !== artifact.bytes ||
        actual.sha256 !== artifact.sha256 ||
        actual.role !== artifact.role
      ) {
        throw new Error(
          `Артефакт ${artifact.fileName} не соответствует манифесту.`,
        );
      }
    }

    const checksums = await readFile(
      join(normalized.releaseDirectory, RELEASE_CHECKSUMS_NAME),
      'utf8',
    );
    if (checksums !== checksumDocument(manifest.artifacts)) {
      throw new Error('Файл checksums.sha256 не соответствует манифесту.');
    }
    const installerVerified = await assertRequiredInstaller(
      manifest.artifacts,
      normalized,
    );

    return {
      artifacts: manifest.artifacts.length,
      bytes: manifest.artifacts.reduce(
        (total, artifact) => total + artifact.bytes,
        0,
      ),
      installerVerified,
    };
  }
}

interface NormalizedReleaseArtifactOptions {
  releaseDirectory: string;
  productName: string;
  version: string;
  requireWindowsInstaller: boolean;
  minimumInstallerBytes: number;
  sourceRevision: string | null;
  buildPlatform: string;
  buildArchitecture: string;
  codeSigning: 'signed' | 'unsigned' | 'not-checked';
}

function normalizeOptions(
  options: ReleaseArtifactOptions,
): NormalizedReleaseArtifactOptions {
  if (!options.productName.trim()) {
    throw new Error('Не указано имя продукта.');
  }
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(options.version)) {
    throw new Error('Некорректная версия релиза.');
  }
  const minimumInstallerBytes = options.minimumInstallerBytes ?? 10 * 1024 * 1024;
  if (!Number.isInteger(minimumInstallerBytes) || minimumInstallerBytes < 2) {
    throw new Error('Некорректный минимальный размер установщика.');
  }
  return {
    releaseDirectory: resolve(options.releaseDirectory),
    productName: options.productName.trim(),
    version: options.version,
    requireWindowsInstaller: options.requireWindowsInstaller ?? false,
    minimumInstallerBytes,
    sourceRevision: options.sourceRevision ?? null,
    buildPlatform: options.buildPlatform ?? process.platform,
    buildArchitecture: options.buildArchitecture ?? process.arch,
    codeSigning: options.codeSigning ?? 'not-checked',
  };
}

async function collectArtifacts(
  options: NormalizedReleaseArtifactOptions,
): Promise<ReleaseArtifactRecord[]> {
  const entries = await readdir(options.releaseDirectory, {
    withFileTypes: true,
  });
  const fileNames = entries
    .filter((entry) => entry.isFile() && isArtifactFile(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, 'en'));
  const records: ReleaseArtifactRecord[] = [];

  for (const fileName of fileNames) {
    assertSafeFileName(fileName);
    const path = join(options.releaseDirectory, fileName);
    records.push({
      fileName,
      role: artifactRole(fileName, options.version),
      bytes: (await stat(path)).size,
      sha256: await sha256(path),
    });
  }
  if (records.length === 0) {
    throw new Error('В каталоге release нет артефактов для манифеста.');
  }
  return records;
}

function isArtifactFile(fileName: string): boolean {
  if (
    fileName === RELEASE_MANIFEST_NAME ||
    fileName === RELEASE_CHECKSUMS_NAME ||
    /^builder-(?:debug|effective-config)\./i.test(fileName)
  ) {
    return false;
  }
  if (
    [
      'release-verification.json',
      'sbom.cdx.json',
      'windows-smoke-report.json',
      'windows-lifecycle-report.json',
    ].includes(fileName)
  ) {
    return true;
  }
  return /\.(?:exe|msi|zip|appimage|dmg|blockmap|ya?ml)$/i.test(fileName);
}

function artifactRole(
  fileName: string,
  version: string,
): ReleaseArtifactRole {
  if (fileName === `Eman-Sticker-Generator-${version}-x64.exe`) {
    return 'installer';
  }
  if (/portable/i.test(fileName) && fileName.toLowerCase().endsWith('.exe')) {
    return 'portable';
  }
  if (fileName === 'sbom.cdx.json') {
    return 'sbom';
  }
  if (fileName === 'windows-smoke-report.json') {
    return 'smoke-report';
  }
  if (fileName === 'windows-lifecycle-report.json') {
    return 'lifecycle-report';
  }
  if (fileName === 'release-verification.json') {
    return 'verification';
  }
  if (/\.(?:blockmap|ya?ml)$/i.test(fileName)) {
    return 'update-metadata';
  }
  return 'package';
}

async function assertRequiredInstaller(
  artifacts: ReleaseArtifactRecord[],
  options: NormalizedReleaseArtifactOptions,
): Promise<boolean> {
  if (!options.requireWindowsInstaller) {
    return false;
  }
  const expectedName = `Eman-Sticker-Generator-${options.version}-x64.exe`;
  const installer = artifacts.find(
    (artifact) =>
      artifact.fileName === expectedName && artifact.role === 'installer',
  );
  if (!installer) {
    throw new Error(`Не найден обязательный установщик ${expectedName}.`);
  }
  if (installer.bytes < options.minimumInstallerBytes) {
    throw new Error(
      `Установщик меньше ${options.minimumInstallerBytes} байт.`,
    );
  }
  const file = await open(join(options.releaseDirectory, installer.fileName));
  try {
    const header = Buffer.alloc(2);
    await file.read(header, 0, header.length, 0);
    if (header.toString('ascii') !== 'MZ') {
      throw new Error('Windows-установщик не имеет корректного PE-заголовка.');
    }
  } finally {
    await file.close();
  }
  return true;
}

function assertManifestMetadata(
  manifest: ReleaseManifest,
  options: NormalizedReleaseArtifactOptions,
): void {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.productName !== options.productName ||
    manifest.version !== options.version ||
    !Array.isArray(manifest.artifacts)
  ) {
    throw new Error('Некорректные метаданные release-manifest.json.');
  }
}

function assertSafeFileName(fileName: string): void {
  if (!fileName || basename(fileName) !== fileName) {
    throw new Error(`Небезопасное имя артефакта: ${fileName}`);
  }
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', rejectPromise);
    stream.once('end', resolvePromise);
  });
  return hash.digest('hex');
}

function checksumDocument(artifacts: ReleaseArtifactRecord[]): string {
  return `${artifacts
    .slice()
    .sort((left, right) => left.fileName.localeCompare(right.fileName, 'en'))
    .map((artifact) => `${artifact.sha256}  ${artifact.fileName}`)
    .join('\n')}\n`;
}

async function atomicWrite(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, path);
}

function normalizeRevision(value: string | null): string | null {
  const normalized = value?.trim() ?? '';
  return /^[a-f0-9]{7,64}$/i.test(normalized) ? normalized : null;
}
