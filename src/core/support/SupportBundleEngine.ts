import { ZipArchive } from 'archiver';
import { createWriteStream } from 'node:fs';
import { access, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { finished } from 'node:stream/promises';
import type {
  AppDiagnostics,
  AppSettings,
  SupportBundleResult,
} from '../../shared/ipc-contract.js';

export interface SupportBundleOptions {
  outputPath: string;
  diagnostics: AppDiagnostics;
  settings: AppSettings;
  logFiles: string[];
}

export class SupportBundleEngine {
  async create(options: SupportBundleOptions): Promise<SupportBundleResult> {
    if (!options.outputPath.toLowerCase().endsWith('.zip')) {
      throw new Error('Отчёт поддержки должен быть ZIP-архивом.');
    }

    await mkdir(dirname(options.outputPath), { recursive: true });
    const output = createWriteStream(options.outputPath);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const completion = finished(output, { cleanup: true });
    archive.pipe(output);

    try {
      archive.append(
        `${JSON.stringify(redactDiagnostics(options.diagnostics), null, 2)}\n`,
        { name: 'diagnostics.json' },
      );
      archive.append(
        `${JSON.stringify(redactSettings(options.settings), null, 2)}\n`,
        { name: 'settings.json' },
      );
      archive.append(SUPPORT_README, { name: 'README.txt' });

      for (const path of options.logFiles) {
        try {
          await access(path);
          const log = await readFile(path, 'utf8');
          archive.append(sanitizeSupportLog(log, options), {
            name: `logs/${basename(path)}`,
          });
        } catch {
          // A rotated log may disappear between discovery and archiving.
        }
      }

      await Promise.all([archive.finalize(), completion]);
    } catch (error) {
      archive.abort();
      output.destroy();
      await rm(options.outputPath, { force: true });
      throw error;
    }

    return {
      path: options.outputPath,
      bytes: (await stat(options.outputPath)).size,
    };
  }
}

export function sanitizeSupportLog(
  log: string,
  options: SupportBundleOptions,
): string {
  const privatePaths = [
    options.diagnostics.templatesPath,
    options.diagnostics.userDataPath,
    options.settings.browserExecutablePath,
  ]
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.length - left.length);

  let sanitized = log;
  for (const path of privatePaths) {
    sanitized = sanitized.replaceAll(
      path,
      path === options.settings.browserExecutablePath
        ? '<customBrowser>'
        : '<userData>',
    );
  }
  return sanitized
    .replaceAll(
      /(?:[A-Za-z]:\\Users\\|\/(?:home|Users)\/)[^/\\\s"]+/g,
      '<home>',
    )
    .replaceAll(
      /([?&](?:token|key|secret|password)=)[^&\s"]+/gi,
      '$1[redacted]',
    );
}

function redactSettings(settings: AppSettings): Record<string, unknown> {
  return {
    ...structuredClone(settings),
    browserExecutablePath: settings.browserExecutablePath
      ? '[custom browser configured]'
      : null,
  };
}

function redactDiagnostics(
  diagnostics: AppDiagnostics,
): Record<string, unknown> {
  return {
    ...structuredClone(diagnostics),
    templatesPath: '<userData>/templates',
    userDataPath: '<userData>',
  };
}

const SUPPORT_README = `Eman Sticker Generator — отчёт диагностики

Архив содержит версии приложения и окружения, обезличенные настройки и
технические журналы. Шаблоны, ссылки на товары, созданные наклейки и
экспортированные файлы в отчёт не включаются.
`;
