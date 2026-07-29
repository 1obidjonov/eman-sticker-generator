import {
  dialog,
  ipcMain,
  shell,
  type BrowserWindow,
  type SaveDialogOptions,
} from 'electron';
import {
  sanitizeExportBaseName,
  type ExportEngine,
} from '../../core/export/index.js';
import {
  IPC_CHANNELS,
  type ExportFileRequest,
  type ExportFormat,
  type ExportResult,
  type ExportZipRequest,
} from '../../shared/ipc-contract.js';

const MAX_SVG_LENGTH = 25 * 1024 * 1024;
const ALLOWED_FORMATS = new Set<ExportFormat>(['svg', 'png', 'jpg']);

export function registerExportHandlers(
  exportEngine: ExportEngine,
  getWindow: () => BrowserWindow | null,
): void {
  const exportedPaths = new Set<string>();

  ipcMain.handle(
    IPC_CHANNELS.export.saveFile,
    async (_event, request: ExportFileRequest): Promise<ExportResult | null> => {
      assertFileRequest(request);
      const baseName = sanitizeExportBaseName(request.baseName);
      const options: SaveDialogOptions = {
        title: 'Экспорт наклейки',
        defaultPath: `${baseName}.${request.format}`,
        filters: [formatFilter(request.format)],
      };
      const selected = await showSaveDialog(getWindow(), options);
      if (selected.canceled || !selected.filePath) {
        return null;
      }

      const artifact = await exportEngine.exportFile({
        svg: request.svg,
        outputPath: selected.filePath,
        format: request.format,
        scale: request.scale,
        quality: request.quality,
      });
      exportedPaths.add(artifact.outputPath);
      return {
        path: artifact.outputPath,
        bytes: artifact.bytes,
        formats: artifact.formats,
        archived: false,
      };
    },
  );

  ipcMain.handle(
    IPC_CHANNELS.export.saveZip,
    async (_event, request: ExportZipRequest): Promise<ExportResult | null> => {
      assertZipRequest(request);
      const baseName = sanitizeExportBaseName(request.baseName);
      const options: SaveDialogOptions = {
        title: 'Экспорт набора форматов',
        defaultPath: `${baseName}.zip`,
        filters: [{ name: 'ZIP-архив', extensions: ['zip'] }],
      };
      const selected = await showSaveDialog(getWindow(), options);
      if (selected.canceled || !selected.filePath) {
        return null;
      }

      const artifact = await exportEngine.exportZip({
        svg: request.svg,
        outputPath: selected.filePath,
        baseName,
        formats: request.formats,
        scale: request.scale,
        quality: request.quality,
      });
      exportedPaths.add(artifact.outputPath);
      return {
        path: artifact.outputPath,
        bytes: artifact.bytes,
        formats: artifact.formats,
        archived: true,
      };
    },
  );

  ipcMain.handle(IPC_CHANNELS.export.reveal, (_event, path: string) => {
    if (typeof path !== 'string' || !exportedPaths.has(path)) {
      throw new Error('Этот путь не относится к текущему экспорту.');
    }
    shell.showItemInFolder(path);
  });
}

function assertFileRequest(
  request: ExportFileRequest,
): asserts request is ExportFileRequest {
  assertBaseRequest(request);
  if (!ALLOWED_FORMATS.has(request.format)) {
    throw new Error('Неподдерживаемый формат экспорта.');
  }
}

function assertZipRequest(
  request: ExportZipRequest,
): asserts request is ExportZipRequest {
  assertBaseRequest(request);
  if (
    !Array.isArray(request.formats) ||
    request.formats.length === 0 ||
    request.formats.some((format) => !ALLOWED_FORMATS.has(format))
  ) {
    throw new Error('Выберите поддерживаемые форматы экспорта.');
  }
}

function assertBaseRequest(
  request: ExportFileRequest | ExportZipRequest,
): void {
  if (!request || typeof request !== 'object') {
    throw new Error('Некорректный запрос экспорта.');
  }
  if (
    typeof request.svg !== 'string' ||
    request.svg.length === 0 ||
    request.svg.length > MAX_SVG_LENGTH ||
    !/<svg(?:\s|>)/i.test(request.svg)
  ) {
    throw new Error('Некорректный или слишком большой SVG.');
  }
  if (typeof request.baseName !== 'string' || request.baseName.length > 200) {
    throw new Error('Некорректное имя файла.');
  }
  if (
    !Number.isInteger(request.scale) ||
    request.scale < 1 ||
    request.scale > 4
  ) {
    throw new Error('Некорректный масштаб экспорта.');
  }
  if (
    !Number.isInteger(request.quality) ||
    request.quality < 1 ||
    request.quality > 100
  ) {
    throw new Error('Некорректное качество JPG.');
  }
}

function formatFilter(format: ExportFormat): Electron.FileFilter {
  if (format === 'svg') {
    return { name: 'SVG — вектор', extensions: ['svg'] };
  }
  if (format === 'png') {
    return { name: 'PNG — прозрачный растр', extensions: ['png'] };
  }
  return { name: 'JPG — компактный растр', extensions: ['jpg', 'jpeg'] };
}

function showSaveDialog(
  owner: BrowserWindow | null,
  options: SaveDialogOptions,
) {
  return owner
    ? dialog.showSaveDialog(owner, options)
    : dialog.showSaveDialog(options);
}
