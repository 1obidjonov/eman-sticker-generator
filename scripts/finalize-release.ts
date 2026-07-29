import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ReleaseArtifactEngine } from '../src/core/release/index.js';

interface PackageManifest {
  productName?: string;
  version: string;
}

const projectRoot = process.cwd();
const manifest = JSON.parse(
  await readFile(join(projectRoot, 'package.json'), 'utf8'),
) as PackageManifest;
const requireWindowsInstaller = process.argv.includes(
  '--require-windows-installer',
);
const codeSigning = signingStatus(process.env.WINDOWS_SIGNATURE_STATUS);
const engine = new ReleaseArtifactEngine();
const result = await engine.finalize({
  releaseDirectory: join(projectRoot, 'release'),
  productName: manifest.productName ?? 'Eman Sticker Generator',
  version: manifest.version,
  requireWindowsInstaller,
  sourceRevision:
    process.env.GITHUB_SHA ?? process.env.SOURCE_REVISION ?? null,
  codeSigning,
});

const bytes = result.artifacts.reduce(
  (total, artifact) => total + artifact.bytes,
  0,
);
console.log(
  `Release manifest: ${result.artifacts.length} artifacts, ${formatBytes(bytes)}, signing ${codeSigning}`,
);

function signingStatus(
  value: string | undefined,
): 'signed' | 'unsigned' | 'not-checked' {
  return value === 'signed' || value === 'unsigned' ? value : 'not-checked';
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
