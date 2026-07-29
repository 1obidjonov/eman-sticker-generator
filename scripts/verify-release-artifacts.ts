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
const result = await new ReleaseArtifactEngine().verify({
  releaseDirectory: join(projectRoot, 'release'),
  productName: manifest.productName ?? 'Eman Sticker Generator',
  version: manifest.version,
  requireWindowsInstaller: process.argv.includes(
    '--require-windows-installer',
  ),
});

console.log(
  `Release artifacts verified: ${result.artifacts} files, ${formatBytes(result.bytes)}${
    result.installerVerified ? ', Windows installer PE header valid' : ''
  }`,
);

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
