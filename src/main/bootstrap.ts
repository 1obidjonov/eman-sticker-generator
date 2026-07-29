import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';

const smokeRequested =
  process.argv.includes('--smoke-test') ||
  process.env.STICKER_SMOKE_TEST === '1';
const tracePath = absoluteEnvironmentPath(
  process.env.STICKER_SMOKE_BOOTSTRAP_LOG,
);

await trace('bootstrap.start', {
  argv: process.argv,
  electron: process.versions.electron ?? null,
  platform: process.platform,
  architecture: process.arch,
}).catch(() => undefined);

try {
  await import('./index.js');
  await trace('bootstrap.main-imported').catch(() => undefined);
} catch (error) {
  const details = errorDetails(error);
  await trace('bootstrap.failed', details).catch(() => undefined);
  if (smokeRequested) {
    await writeBootstrapFailureReport(details).catch(() => undefined);
  }
  process.exit(1);
}

async function trace(
  event: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  if (!tracePath) {
    return;
  }
  await mkdir(dirname(tracePath), { recursive: true });
  await appendFile(
    tracePath,
    `${JSON.stringify({
      timestamp: new Date().toISOString(),
      event,
      ...details,
    })}\n`,
    'utf8',
  );
}

async function writeBootstrapFailureReport(
  details: Record<string, unknown>,
): Promise<void> {
  const outputPath = absoluteEnvironmentPath(
    process.env.STICKER_SMOKE_OUTPUT,
    '.json',
  );
  if (!outputPath) {
    return;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        status: 'failed',
        productName: 'Eman Sticker Generator',
        version: process.env.STICKER_APP_VERSION ?? 'unknown',
        packaged: true,
        platform: process.platform,
        architecture: process.arch,
        checks: [
          {
            name: 'Main process bootstrap',
            status: 'failed',
            detail: String(details.message ?? 'Unknown bootstrap error'),
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

function absoluteEnvironmentPath(
  value: string | undefined,
  requiredSuffix?: string,
): string | null {
  const path = value?.trim();
  if (
    !path ||
    !isAbsolute(path) ||
    (requiredSuffix && !path.toLowerCase().endsWith(requiredSuffix))
  ) {
    return null;
  }
  return path;
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error) };
}
