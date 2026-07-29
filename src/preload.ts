import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type StickerGeneratorAPI,
} from './shared/ipc-contract.js';

const api: StickerGeneratorAPI = {
  templates: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.templates.list),
    create: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.templates.create, input),
    open: (id) => ipcRenderer.invoke(IPC_CHANNELS.templates.open, id),
    rename: (input) =>
      ipcRenderer.invoke(IPC_CHANNELS.templates.rename, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.templates.delete, id),
    save: (template) =>
      ipcRenderer.invoke(IPC_CHANNELS.templates.save, template),
    getBackground: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.templates.getBackground, id),
    getThumbnail: (id) =>
      ipcRenderer.invoke(IPC_CHANNELS.templates.getThumbnail, id),
  },
  export: {
    saveFile: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.export.saveFile, request),
    saveZip: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.export.saveZip, request),
    reveal: (path) => ipcRenderer.invoke(IPC_CHANNELS.export.reveal, path),
  },
  parsers: {
    listAvailable: () =>
      ipcRenderer.invoke(IPC_CHANNELS.parsers.listAvailable),
  },
  generation: {
    start: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.generation.start, request),
    cancel: (jobId) =>
      ipcRenderer.invoke(IPC_CHANNELS.generation.cancel, jobId),
    getJob: (jobId) =>
      ipcRenderer.invoke(IPC_CHANNELS.generation.getJob, jobId),
    exportAll: (request) =>
      ipcRenderer.invoke(IPC_CHANNELS.generation.exportAll, request),
    reveal: (path) =>
      ipcRenderer.invoke(IPC_CHANNELS.generation.reveal, path),
    onProgress: (jobId, listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        progress: Parameters<typeof listener>[0],
      ) => {
        if (progress.jobId === jobId) {
          listener(progress);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.generation.progress, handler);
      return () =>
        ipcRenderer.removeListener(
          IPC_CHANNELS.generation.progress,
          handler,
        );
    },
    onItem: (jobId, listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        item: Parameters<typeof listener>[0],
      ) => {
        if (item.jobId === jobId) {
          listener(item);
        }
      };
      ipcRenderer.on(IPC_CHANNELS.generation.item, handler);
      return () =>
        ipcRenderer.removeListener(IPC_CHANNELS.generation.item, handler);
    },
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settings.get),
    update: (patch) =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.update, patch),
    reset: () => ipcRenderer.invoke(IPC_CHANNELS.settings.reset),
    chooseBrowserExecutable: () =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.chooseBrowserExecutable),
    getDiagnostics: () =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.getDiagnostics),
    revealDataDirectory: () =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.revealDataDirectory),
    revealLogsDirectory: () =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.revealLogsDirectory),
    createSupportBundle: () =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.createSupportBundle),
    revealSupportBundle: (path) =>
      ipcRenderer.invoke(IPC_CHANNELS.settings.revealSupportBundle, path),
  },
};

contextBridge.exposeInMainWorld('stickerGenerator', api);
