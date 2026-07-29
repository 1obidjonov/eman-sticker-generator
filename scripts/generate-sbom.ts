import { execFile } from 'node:child_process';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface CycloneDxDocument {
  bomFormat?: string;
  specVersion?: string;
  metadata?: {
    component?: {
      version?: string;
    };
  };
  components?: unknown[];
}

const projectRoot = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  throw new Error(
    'Не найден npm CLI. Запустите генерацию через npm run release:sbom.',
  );
}

const stdout = await executeNpmSbom(npmCli);
const document = JSON.parse(stdout) as CycloneDxDocument;
if (
  document.bomFormat !== 'CycloneDX' ||
  !document.specVersion ||
  !document.metadata?.component?.version ||
  !document.components?.length
) {
  throw new Error('npm сформировал неполный CycloneDX SBOM.');
}

const releaseDirectory = join(projectRoot, 'release');
const outputPath = join(releaseDirectory, 'sbom.cdx.json');
const temporaryPath = `${outputPath}.${process.pid}.tmp`;
await mkdir(releaseDirectory, { recursive: true });
await writeFile(
  temporaryPath,
  `${JSON.stringify(document, null, 2)}\n`,
  'utf8',
);
await rename(temporaryPath, outputPath);

console.log(
  `SBOM: ${outputPath} (${document.components.length} components, CycloneDX ${document.specVersion})`,
);

function executeNpmSbom(npmCliPath: string): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      process.execPath,
      [
        npmCliPath,
        'sbom',
        '--omit=dev',
        '--sbom-format=cyclonedx',
      ],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          rejectPromise(
            new Error(
              `Не удалось сформировать SBOM: ${stderr.trim() || error.message}`,
            ),
          );
          return;
        }
        resolvePromise(stdout);
      },
    );
  });
}
