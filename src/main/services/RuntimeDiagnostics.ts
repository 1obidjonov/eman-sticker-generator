import {
  app,
  type Details,
  type Event,
  type RenderProcessGoneDetails,
  type WebContents,
} from 'electron';
import type { ApplicationLogger } from './ApplicationLogger.js';
import { errorDetails } from './ApplicationLogger.js';

export function registerRuntimeDiagnostics(
  logger: ApplicationLogger,
): () => void {
  const handleUncaughtException = (error: Error) => {
    void logger.error(
      'process.uncaught-exception',
      errorDetails(error),
    );
  };
  const handleUnhandledRejection = (reason: unknown) => {
    void logger.error(
      'process.unhandled-rejection',
      errorDetails(reason),
    );
  };
  const handleRenderProcessGone = (
    _event: Event,
    webContents: WebContents,
    details: RenderProcessGoneDetails,
  ) => {
    void logger.error('electron.render-process-gone', {
      reason: details.reason,
      exitCode: details.exitCode,
      type: webContents.getType(),
    });
  };
  const handleChildProcessGone = (_event: Event, details: Details) => {
    void logger.error('electron.child-process-gone', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name,
    });
  };

  process.on('uncaughtExceptionMonitor', handleUncaughtException);
  process.on('unhandledRejection', handleUnhandledRejection);
  app.on('render-process-gone', handleRenderProcessGone);
  app.on('child-process-gone', handleChildProcessGone);

  return () => {
    process.off('uncaughtExceptionMonitor', handleUncaughtException);
    process.off('unhandledRejection', handleUnhandledRejection);
    app.off('render-process-gone', handleRenderProcessGone);
    app.off('child-process-gone', handleChildProcessGone);
  };
}
