import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { PlaywrightBrowserPool } from '../core/browser/index.js';
import {
  BatchExportEngine,
  ExportEngine,
  SharpRasterizer,
} from '../core/export/index.js';
import {
  ParserEngine,
  ParserRegistry,
  SchemaOrgProductParser,
} from '../core/parsers/index.js';
import { PlaywrightTextMeasurementService } from '../core/renderer-engine/index.js';
import { registerExportHandlers } from './ipc/registerExportHandlers.js';
import { registerGenerationHandlers } from './ipc/registerGenerationHandlers.js';
import { registerSettingsHandlers } from './ipc/registerSettingsHandlers.js';
import { registerTemplateHandlers } from './ipc/registerTemplateHandlers.js';
import {
  ApplicationLogger,
  errorDetails,
} from './services/ApplicationLogger.js';
import { launchApplicationBrowser } from './services/BrowserFactory.js';
import { GenerationService } from './services/GenerationService.js';
import { registerRuntimeDiagnostics } from './services/RuntimeDiagnostics.js';
import { SettingsService } from './services/SettingsService.js';
import {
  parseSmokeTestRequest,
  writeSmokeTestReport,
  type SmokeTestCheck,
  type SmokeTestRequest,
} from './services/SmokeTestService.js';
import { TemplateService } from './services/TemplateService.js';
import { createMainWindow } from './window.js';

let mainWindow: BrowserWindow | null = null;
let applicationLogger: ApplicationLogger | null = null;
let cleanupApplication: (() => Promise<void>) | null = null;
let cleanupStarted = false;
let smokeTestRequest: SmokeTestRequest | null = null;

const ownsSingleInstanceLock = app.requestSingleInstanceLock();
if (!ownsSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  try {
    smokeTestRequest = parseSmokeTestRequest(process.argv);
    if (smokeTestRequest?.userDataPath) {
      app.setPath('userData', smokeTestRequest.userDataPath);
    }
    await startApplication();
  } catch (error) {
    process.exitCode = 1;
    await logStartupFailure(error);
    if (smokeTestRequest) {
      await writeFailedStartupSmokeReport(smokeTestRequest, error).catch(
        () => undefined,
      );
    } else {
      dialog.showErrorBox(
        'Не удалось запустить Eman Sticker Generator',
        error instanceof Error ? error.message : String(error),
      );
    }
    app.quit();
  }
}

async function logStartupFailure(error: unknown): Promise<void> {
  if (applicationLogger) {
    await applicationLogger
      .error('application.start-failed', errorDetails(error))
      .catch(() => undefined);
  }
}

async function startApplication(): Promise<void> {
  await app.whenReady();
  app.setAppUserModelId('uz.eman.stickergenerator');

  const userDataPath = app.getPath('userData');
  const templatesPath = join(userDataPath, 'templates');
  applicationLogger = new ApplicationLogger(join(userDataPath, 'logs'));
  await applicationLogger.initialize();
  const unregisterRuntimeDiagnostics =
    registerRuntimeDiagnostics(applicationLogger);
  await applicationLogger.info('application.start', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    architecture: process.arch,
  });

  const settingsService = new SettingsService(
    join(userDataPath, 'settings.json'),
  );
  const settings = await settingsService.initialize();
  const templateService = new TemplateService(templatesPath);
  await templateService.initialize();
  registerTemplateHandlers(templateService, () => mainWindow);

  const rasterizer = new SharpRasterizer();
  registerExportHandlers(new ExportEngine(rasterizer), () => mainWindow);

  const browserPool = new PlaywrightBrowserPool(
    () =>
      launchApplicationBrowser({
        executablePath: settings.browserExecutablePath,
      }),
    {
      maxPages: 8,
    },
  );
  const parserRegistry = new ParserRegistry().register(
    new SchemaOrgProductParser({
      navigationTimeoutMs: settings.parserTimeoutSeconds * 1_000,
    }),
  );
  const parserEngine = new ParserEngine(parserRegistry, browserPool);
  const generationService = new GenerationService(
    templateService,
    parserEngine,
    new PlaywrightTextMeasurementService(browserPool),
    settings.generationConcurrency,
  );
  const unregisterGenerationHandlers = registerGenerationHandlers(
    generationService,
    parserRegistry,
    new BatchExportEngine(rasterizer),
    () => mainWindow,
  );
  const unregisterSettingsHandlers = registerSettingsHandlers({
    settingsService,
    getWindow: () => mainWindow,
    userDataPath,
    templatesPath,
    parserCount: parserRegistry.list().length,
    logger: applicationLogger,
  });

  const openMainWindow = (showWhenReady = true): BrowserWindow => {
    const window = createMainWindow(settingsService.get().theme, {
      showWhenReady,
    });
    mainWindow = window;
    void applicationLogger?.info('window.open', {
      smokeTest: !showWhenReady,
    });
    window.on('unresponsive', () => {
      void applicationLogger?.warn('window.unresponsive');
    });
    window.on('closed', () => {
      if (mainWindow === window) {
        mainWindow = null;
      }
      void applicationLogger?.info('window.closed');
    });
    return window;
  };

  cleanupApplication = async () => {
    unregisterGenerationHandlers();
    unregisterSettingsHandlers();
    unregisterRuntimeDiagnostics();
    await browserPool.close();
    await applicationLogger?.info('application.stop');
    await applicationLogger?.flush();
  };

  if (smokeTestRequest) {
    const request = smokeTestRequest;
    const smokeWindow = openMainWindow(false);
    void runApplicationSmokeTest(smokeWindow, request).catch(
      async (error) => {
        process.exitCode = 1;
        await applicationLogger
          ?.error('application.smoke-test-failed', errorDetails(error))
          .catch(() => undefined);
        await writeSmokeExecutionFailureReport(
          request,
          error,
        ).catch(() => undefined);
        app.quit();
      },
    );
    return;
  }

  openMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      openMainWindow();
    }
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

interface RendererSmokeState {
  title: string;
  rootChildren: number;
  bridgeAvailable: boolean;
  settingsApiAvailable: boolean;
}

async function runApplicationSmokeTest(
  window: BrowserWindow,
  request: SmokeTestRequest,
): Promise<void> {
  const checks: SmokeTestCheck[] = [
    {
      name: 'Main process initialization',
      status: 'passed',
      detail: 'services and IPC handlers registered',
    },
  ];

  try {
    const renderer = await waitForRenderer(window, request.timeoutMs);
    checks.push(
      {
        name: 'Renderer load',
        status: renderer.rootChildren > 0 ? 'passed' : 'failed',
        detail: `${renderer.rootChildren} root element(s) rendered`,
      },
      {
        name: 'Application title',
        status:
          renderer.title === 'Eman Sticker Generator' ? 'passed' : 'failed',
        detail: renderer.title || 'empty title',
      },
      {
        name: 'Preload bridge',
        status:
          renderer.bridgeAvailable && renderer.settingsApiAvailable
            ? 'passed'
            : 'failed',
        detail:
          renderer.bridgeAvailable && renderer.settingsApiAvailable
            ? 'typed settings API available'
            : 'preload API is unavailable',
      },
    );
  } catch (error) {
    checks.push({
      name: 'Renderer load',
      status: 'failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const status = checks.every((check) => check.status === 'passed')
    ? 'passed'
    : 'failed';
  await writeSmokeTestReport(request.outputPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status,
    productName: 'Eman Sticker Generator',
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    architecture: process.arch,
    checks,
  });
  await applicationLogger?.info('application.smoke-test', {
    status,
    checks: checks.length,
  });
  if (status === 'failed') {
    process.exitCode = 1;
  }
  app.quit();
}

async function waitForRenderer(
  window: BrowserWindow,
  timeoutMs: number,
): Promise<RendererSmokeState> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      throw new Error('Renderer window was destroyed before loading.');
    }
    try {
      const state = (await window.webContents.executeJavaScript(`
        (() => ({
          title: document.title,
          rootChildren: document.getElementById('root')?.childElementCount ?? 0,
          bridgeAvailable: typeof window.stickerGenerator === 'object',
          settingsApiAvailable:
            typeof window.stickerGenerator?.settings?.get === 'function'
        }))()
      `)) as RendererSmokeState;
      if (state.rootChildren > 0) {
        return state;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }

  throw new Error(
    lastError instanceof Error
      ? `Renderer timeout: ${lastError.message}`
      : `Renderer did not become ready within ${timeoutMs} ms.`,
  );
}

async function writeFailedStartupSmokeReport(
  request: SmokeTestRequest,
  error: unknown,
): Promise<void> {
  await writeSmokeTestReport(request.outputPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'failed',
    productName: 'Eman Sticker Generator',
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    architecture: process.arch,
    checks: [
      {
        name: 'Main process initialization',
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      },
    ],
  });
}

async function writeSmokeExecutionFailureReport(
  request: SmokeTestRequest,
  error: unknown,
): Promise<void> {
  await writeSmokeTestReport(request.outputPath, {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'failed',
    productName: 'Eman Sticker Generator',
    version: app.getVersion(),
    packaged: app.isPackaged,
    platform: process.platform,
    architecture: process.arch,
    checks: [
      {
        name: 'Smoke-test execution',
        status: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      },
    ],
  });
}

app.on('before-quit', (event) => {
  if (cleanupStarted || !cleanupApplication) {
    return;
  }
  event.preventDefault();
  cleanupStarted = true;
  void cleanupApplication()
    .catch((error) =>
      applicationLogger
        ?.error('application.cleanup-failed', errorDetails(error))
        .catch(() => undefined),
    )
    .finally(() => app.quit());
});
