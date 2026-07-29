import { extractFile, listPackage } from '@electron/asar';
import { resolve } from 'node:path';

interface PackagedManifest {
  name?: string;
  productName?: string;
  version?: string;
  main?: string;
}

const archiveArgument = process.argv[2];
if (!archiveArgument) {
  throw new Error(
    'Usage: npm run release:verify-asar -- <path-to-app.asar>',
  );
}

const archivePath = resolve(archiveArgument);
const files = new Set(
  listPackage(archivePath, { isPack: false }).map((path) =>
    path.replaceAll('\\', '/').replace(/^\/+/, ''),
  ),
);
const requiredFiles = [
  'package.json',
  'dist/src/main/bootstrap.js',
  'dist/src/main/index.js',
  'dist/src/preload.cjs',
  'dist/renderer/index.html',
];

for (const file of requiredFiles) {
  if (!files.has(file)) {
    throw new Error(`Packaged ASAR is missing ${file}.`);
  }
}

const manifest = JSON.parse(
  extractFile(archivePath, 'package.json').toString('utf8'),
) as PackagedManifest;
if (manifest.main !== 'dist/src/main/bootstrap.js') {
  throw new Error(
    `Packaged main entry is ${manifest.main ?? 'missing'}, expected dist/src/main/bootstrap.js.`,
  );
}

console.log(
  JSON.stringify(
    {
      status: 'passed',
      archive: archivePath,
      files: files.size,
      manifest: {
        name: manifest.name,
        productName: manifest.productName,
        version: manifest.version,
        main: manifest.main,
      },
      requiredFiles,
    },
    null,
    2,
  ),
);
