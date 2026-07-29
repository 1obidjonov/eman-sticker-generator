import { constants, existsSync } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  app,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type BrowserWindow,
  type OpenDialogOptions,
  type SaveDialogOptions,
} from 'electron';
import { SupportBundleEngine } from '../../core/support/index.js';
import {
  IPC_CHANNELS,
  type AppDiagnostics,
  type AppSettings,
  type BrowserDiagnostic,
  type SupportBundleResult,
  type ThemePreference,
} from '../../shared/ipc-contract.js';
import {
  errorDetails,
  type ApplicationLogger,
} from '../services/ApplicationLogger.js';
import { launchApplicationBrowser } from '../services/BrowserFactory.js';
import type { SettingsService } from '../services/SettingsService.js';

export interface SettingsHandlerOptions {
  settingsService: SettingsService;
  getWindow(): BrowserWindow | null;
  userDataPath: string;
  templatesPath: string;
  parserCount: number;
  logger: ApplicationLogger;
}

export function registerSettingsHandlers(
  options: SettingsHandlerOptions,
): () => void {
  const {
    settingsService,
    getWindow,
    userDataPath,
    templatesPath,
    parserCount,
    logger,
  } = options;
  const supportBundleEngine = new SupportBundleEngine();
  const createdSupportBundles = new Set<string>();

  ipcMain.handle(IPC_CHANNELS.settings.get, () => settingsService.get());
  ipcMain.handle(
    IPC_CHANNELS.settings.update,
    async (_event, patch: Partial<AppSettings>) => {
      const settings = await settingsService.update(patch);
      applyNativeTheme(settings.theme, getWindow());
      return settings;
    },
  );
  ipcMain.handle(IPC_CHANNELS.settings.reset, async () => {
    const settings = await settingsService.reset();
    applyNativeTheme(settings.theme, getWindow());
    return settings;
  });
  ipcMain.handle(
    IPC_CHANNELS.settings.chooseBrowserExecutable,
    async (): Promise<string | null> => {
      const dialogOptions: OpenDialogOptions = {
        title: 'Выберите Chrome или Chromium',
        buttonLabel: 'Выбрать браузер',
        properties: ['openFile'],
        ...(process.platform === 'win32'
          ? {
              filters: [
                {
                  name: 'Исполняемые файлы',
                  extensions: ['exe'],
                },
              ],
            }
          : {}),
      };
      const owner = getWindow();
      const selected = owner
        ? await dialog.showOpenDialog(owner, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);
      const executablePath = selected.filePaths[0];
      if (selected.canceled || !executablePath) {
        return null;
      }
      await assertExecutable(executablePath);
      return executablePath;
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.settings.getDiagnostics,
    async (): Promise<AppDiagnostics> =>
      collectDiagnostics({
        settings: settingsService.get(),
        templatesPath,
        userDataPath,
        parserCount,
      }),
  );
  ipcMain.handle(
    IPC_CHANNELS.settings.revealDataDirectory,
    async (): Promise<void> => {
      const error = await shell.openPath(userDataPath);
      if (error) {
        throw new Error(`Не удалось открыть папку данных: ${error}`);
      }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.settings.revealLogsDirectory,
    async (): Promise<void> => {
      const error = await shell.openPath(logger.getDirectory());
      if (error) {
        throw new Error(`Не удалось открыть папку журналов: ${error}`);
      }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.settings.createSupportBundle,
    async (): Promise<SupportBundleResult | null> => {
      const dialogOptions: SaveDialogOptions = {
        title: 'Сохранить отчёт для поддержки',
        buttonLabel: 'Сохранить отчёт',
        defaultPath: supportBundleName(),
        filters: [{ name: 'ZIP-архив', extensions: ['zip'] }],
      };
      const owner = getWindow();
      const selected = owner
        ? await dialog.showSaveDialog(owner, dialogOptions)
        : await dialog.showSaveDialog(dialogOptions);
      if (selected.canceled || !selected.filePath) {
        return null;
      }

      const outputPath = selected.filePath.toLowerCase().endsWith('.zip')
        ? selected.filePath
        : `${selected.filePath}.zip`;
      try {
        const result = await supportBundleEngine.create({
          outputPath,
          diagnostics: await collectDiagnostics({
            settings: settingsService.get(),
            templatesPath,
            userDataPath,
            parserCount,
          }),
          settings: settingsService.get(),
          logFiles: await logger.listFiles(),
        });
        createdSupportBundles.add(resolve(result.path));
        await logger.info('support.bundle-created', {
          bytes: result.bytes,
        });
        return result;
      } catch (error) {
        await logger.error(
          'support.bundle-failed',
          errorDetails(error),
        );
        throw error;
      }
    },
  );
  ipcMain.handle(
    IPC_CHANNELS.settings.revealSupportBundle,
    async (_event, path: string): Promise<void> => {
      if (
        typeof path !== 'string' ||
        !createdSupportBundles.has(resolve(path))
      ) {
        throw new Error('Нельзя открыть неизвестный отчёт поддержки.');
      }
      shell.showItemInFolder(path);
    },
  );

  const handleThemeUpdate = () => updateWindowBackground(getWindow);
  nativeTheme.on('updated', handleThemeUpdate);

  return () => {
    nativeTheme.off('updated', handleThemeUpdate);
  };
}

async function collectDiagnostics(options: {
  settings: AppSettings;
  templatesPath: string;
  userDataPath: string;
  parserCount: number;
}): Promise<AppDiagnostics> {
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron ?? 'unknown',
    chromiumVersion: process.versions.chrome ?? 'unknown',
    nodeVersion: process.versions.node,
    platform: process.platform,
    architecture: process.arch,
    templatesPath: options.templatesPath,
    userDataPath: options.userDataPath,
    parserCount: options.parserCount,
    browser: await inspectBrowser(options.settings),
  };
}

export function applyNativeTheme(
  theme: ThemePreference,
  window: BrowserWindow | null,
): void {
  nativeTheme.themeSource = theme;
  updateWindowBackground(() => window);
}

async function inspectBrowser(settings: AppSettings): Promise<BrowserDiagnostic> {
  const startedAt = Date.now();
  let browser: Awaited<ReturnType<typeof launchApplicationBrowser>> | null = null;
  try {
    browser = await launchApplicationBrowser({
      executablePath: settings.browserExecutablePath,
    });
    return {
      status: 'ready',
      version: await browser.version(),
      launchDurationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'error',
      launchDurationMs: Date.now() - startedAt,
      message: toErrorMessage(error),
    };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

async function assertExecutable(path: string): Promise<void> {
  if (!existsSync(path) || !(await stat(path)).isFile()) {
    throw new Error('Выбранный файл браузера не существует.');
  }
  if (process.platform !== 'win32') {
    try {
      await access(path, constants.X_OK);
    } catch {
      throw new Error('У выбранного файла нет права на запуск.');
    }
  }
}

function updateWindowBackground(
  getWindow: () => BrowserWindow | null,
): void {
  getWindow()?.setBackgroundColor(
    nativeTheme.shouldUseDarkColors ? '#101713' : '#f4f6f5',
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось запустить Chrome или Chromium.';
}

function supportBundleName(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `Eman-Sticker-Generator-support-${date}.zip`;
}
