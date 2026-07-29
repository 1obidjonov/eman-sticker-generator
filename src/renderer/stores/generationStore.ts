import { create } from 'zustand';
import type {
  ExportFormat,
  ExportResult,
  GeneratedStickerPreview,
  GenerationProgress,
  ParserDescriptor,
} from '../../shared/ipc-contract.js';

interface BatchExportSettings {
  formats: ExportFormat[];
  scale: number;
  quality: number;
  revealAfterExport?: boolean;
}

interface GenerationState {
  urlsText: string;
  parsers: ParserDescriptor[];
  jobId: string | null;
  progress: GenerationProgress | null;
  items: GeneratedStickerPreview[];
  isStarting: boolean;
  isExporting: boolean;
  error: string | null;
  lastExport: ExportResult | null;
  setUrlsText(value: string): void;
  loadParsers(): Promise<void>;
  start(templateId: string, concurrency?: number): Promise<void>;
  cancel(): Promise<void>;
  exportAll(settings: BatchExportSettings): Promise<void>;
  revealLastExport(): Promise<void>;
  clearError(): void;
}

let unsubscribeProgress: (() => void) | null = null;
let unsubscribeItem: (() => void) | null = null;

export const useGenerationStore = create<GenerationState>((set, get) => ({
  urlsText: '',
  parsers: [],
  jobId: null,
  progress: null,
  items: [],
  isStarting: false,
  isExporting: false,
  error: null,
  lastExport: null,

  setUrlsText(value) {
    set({ urlsText: value, error: null, lastExport: null });
  },

  async loadParsers() {
    try {
      const parsers = await requireApi().parsers.listAvailable();
      set({ parsers });
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  async start(templateId, concurrency) {
    if (get().isStarting || get().progress?.status === 'running') {
      return;
    }
    const urls = parseUrls(get().urlsText);
    if (urls.length === 0) {
      set({ error: 'Добавьте хотя бы одну ссылку на товар.' });
      return;
    }

    set({
      isStarting: true,
      error: null,
      lastExport: null,
      items: [],
      progress: null,
    });

    try {
      const api = requireApi();
      const handle = await api.generation.start({
        templateId,
        urls,
        ...(concurrency !== undefined ? { concurrency } : {}),
      });
      cleanupSubscriptions();

      unsubscribeProgress = api.generation.onProgress(
        handle.jobId,
        (progress) => set({ progress }),
      );
      unsubscribeItem = api.generation.onItem(handle.jobId, (item) => {
        set((state) => ({
          items: replaceItem(state.items, item),
        }));
      });

      const snapshot = await api.generation.getJob(handle.jobId);
      set({
        jobId: handle.jobId,
        progress: snapshot.progress,
        items: snapshot.items,
        isStarting: false,
      });
    } catch (error) {
      cleanupSubscriptions();
      set({
        isStarting: false,
        error: toErrorMessage(error),
      });
    }
  },

  async cancel() {
    const jobId = get().jobId;
    if (!jobId) {
      return;
    }
    try {
      await requireApi().generation.cancel(jobId);
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  async exportAll(settings) {
    const jobId = get().jobId;
    if (!jobId || get().isExporting) {
      return;
    }
    set({ isExporting: true, error: null, lastExport: null });
    try {
      const api = requireApi();
      const result = await api.generation.exportAll({
        jobId,
        formats: settings.formats,
        scale: settings.scale,
        quality: settings.quality,
      });
      set({
        isExporting: false,
        ...(result ? { lastExport: result } : {}),
      });
      if (result && settings.revealAfterExport) {
        await api.generation.reveal(result.path);
      }
    } catch (error) {
      set({
        isExporting: false,
        error: toErrorMessage(error),
      });
    }
  },

  async revealLastExport() {
    const lastExport = get().lastExport;
    if (!lastExport) {
      return;
    }
    try {
      await requireApi().generation.reveal(lastExport.path);
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  clearError() {
    set({ error: null });
  },
}));

function parseUrls(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  ];
}

function replaceItem(
  items: GeneratedStickerPreview[],
  item: GeneratedStickerPreview,
): GeneratedStickerPreview[] {
  const next = [...items];
  next[item.index] = item;
  return next;
}

function cleanupSubscriptions(): void {
  unsubscribeProgress?.();
  unsubscribeItem?.();
  unsubscribeProgress = null;
  unsubscribeItem = null;
}

function requireApi() {
  if (!window.stickerGenerator) {
    throw new Error(
      'Генерация доступна только в настольном приложении.',
    );
  }
  return window.stickerGenerator;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось выполнить операцию.';
}
