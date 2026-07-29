import { create } from 'zustand';
import type {
  TemplateAssetData,
  TemplateSummary,
} from '../../shared/ipc-contract.js';
import type {
  Field,
  QRField,
  Template,
  TextField,
} from '../../shared/types/index.js';

export type ApplicationView =
  | 'templates'
  | 'editor'
  | 'generate'
  | 'export'
  | 'settings';

interface TemplateState {
  view: ApplicationView;
  summaries: TemplateSummary[];
  thumbnails: Record<string, string>;
  current: Template | null;
  background: TemplateAssetData | null;
  selectedFieldId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  isDirty: boolean;
  error: string | null;
  loadTemplates(): Promise<void>;
  createTemplate(name: string): Promise<boolean>;
  openTemplate(id: string): Promise<void>;
  renameTemplate(id: string, name: string): Promise<void>;
  deleteTemplate(id: string): Promise<void>;
  saveCurrent(): Promise<void>;
  closeEditor(): void;
  openEditor(): void;
  openGenerate(): void;
  openExport(): void;
  openSettings(): void;
  selectField(id: string | null): void;
  addField(type: 'text' | 'qr'): void;
  updateField(id: string, updater: (field: Field) => Field): void;
  deleteField(id: string): void;
  clearError(): void;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  view: 'templates',
  summaries: [],
  thumbnails: {},
  current: null,
  background: null,
  selectedFieldId: null,
  isLoading: false,
  isSaving: false,
  isDirty: false,
  error: null,

  async loadTemplates() {
    set({ isLoading: true, error: null });
    try {
      const api = requireApi();
      const summaries = await api.templates.list();
      set({ summaries, isLoading: false });

      const thumbnailEntries = await Promise.all(
        summaries.map(async (summary) => {
          try {
            const asset = await api.templates.getThumbnail(summary.id);
            return [summary.id, asset.dataUrl] as const;
          } catch {
            return null;
          }
        }),
      );
      const thumbnails = Object.fromEntries(
        thumbnailEntries.filter(
          (entry): entry is readonly [string, string] => entry !== null,
        ),
      );
      set({ thumbnails });
    } catch (error) {
      set({ isLoading: false, error: toErrorMessage(error) });
    }
  },

  async createTemplate(name) {
    set({ isLoading: true, error: null });
    try {
      const api = requireApi();
      const template = await api.templates.create({ name });
      if (!template) {
        set({ isLoading: false });
        return false;
      }

      const background = await api.templates.getBackground(template.id);
      const summaries = await api.templates.list();
      set({
        summaries,
        current: template,
        background,
        view: 'editor',
        isLoading: false,
        isDirty: false,
        selectedFieldId: null,
      });
      return true;
    } catch (error) {
      set({ isLoading: false, error: toErrorMessage(error) });
      return false;
    }
  },

  async openTemplate(id) {
    set({ isLoading: true, error: null });
    try {
      const api = requireApi();
      const [current, background] = await Promise.all([
        api.templates.open(id),
        api.templates.getBackground(id),
      ]);
      set({
        current,
        background,
        view: 'editor',
        isLoading: false,
        isDirty: false,
        selectedFieldId: null,
      });
    } catch (error) {
      set({ isLoading: false, error: toErrorMessage(error) });
    }
  },

  async renameTemplate(id, name) {
    set({ error: null });
    try {
      const renamed = await requireApi().templates.rename({ id, name });
      set((state) => ({
        summaries: state.summaries.map((summary) =>
          summary.id === id
            ? { ...summary, name: renamed.name, updatedAt: renamed.updatedAt }
            : summary,
        ),
        current:
          state.current?.id === id
            ? { ...state.current, name: renamed.name }
            : state.current,
      }));
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  async deleteTemplate(id) {
    set({ error: null });
    try {
      await requireApi().templates.delete(id);
      set((state) => ({
        summaries: state.summaries.filter((summary) => summary.id !== id),
        thumbnails: Object.fromEntries(
          Object.entries(state.thumbnails).filter(([key]) => key !== id),
        ),
      }));
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  async saveCurrent() {
    const current = get().current;
    if (!current || get().isSaving) {
      return;
    }

    set({ isSaving: true, error: null });
    try {
      const saved = await requireApi().templates.save(current);
      set((state) => ({
        current: saved,
        isSaving: false,
        isDirty: false,
        summaries: state.summaries.map((summary) =>
          summary.id === saved.id
            ? {
                ...summary,
                name: saved.name,
                updatedAt: saved.updatedAt,
                fieldCount: saved.fields.length,
              }
            : summary,
        ),
      }));
    } catch (error) {
      set({ isSaving: false, error: toErrorMessage(error) });
    }
  },

  closeEditor() {
    set({
      view: 'templates',
      current: null,
      background: null,
      selectedFieldId: null,
      isDirty: false,
    });
    void get().loadTemplates();
  },

  openEditor() {
    if (get().current && get().background) {
      set({ view: 'editor' });
    }
  },

  openGenerate() {
    if (get().current && get().background) {
      set({ view: 'generate', selectedFieldId: null });
    }
  },

  openExport() {
    if (get().current && get().background) {
      set({ view: 'export', selectedFieldId: null });
    }
  },

  openSettings() {
    set({ view: 'settings', selectedFieldId: null });
  },

  selectField(id) {
    set({ selectedFieldId: id });
  },

  addField(type) {
    const current = get().current;
    if (!current) {
      return;
    }

    const offset = current.fields.length * 18;
    const field =
      type === 'text'
        ? createTextField(offset, current)
        : createQrField(offset, current);
    set({
      current: {
        ...current,
        fields: [...current.fields, field],
      },
      selectedFieldId: field.id,
      isDirty: true,
    });
  },

  updateField(id, updater) {
    const current = get().current;
    if (!current) {
      return;
    }
    set({
      current: {
        ...current,
        fields: current.fields.map((field) =>
          field.id === id ? updater(field) : field,
        ),
      },
      isDirty: true,
    });
  },

  deleteField(id) {
    const current = get().current;
    if (!current) {
      return;
    }
    set({
      current: {
        ...current,
        fields: current.fields.filter((field) => field.id !== id),
      },
      selectedFieldId:
        get().selectedFieldId === id ? null : get().selectedFieldId,
      isDirty: true,
    });
  },

  clearError() {
    set({ error: null });
  },
}));

function createTextField(offset: number, template: Template): TextField {
  const width = Math.min(420, template.background.width * 0.55);
  const height = Math.min(110, template.background.height * 0.2);
  return {
    id: crypto.randomUUID(),
    name: 'Название товара',
    type: 'text',
    source: 'productName',
    rect: {
      x: clamp(40 + offset, 0, Math.max(0, template.background.width - width)),
      y: clamp(40 + offset, 0, Math.max(0, template.background.height - height)),
      width,
      height,
    },
    zIndex: nextZIndex(template.fields),
    font: {
      family: 'Arial',
      size: 42,
      minSize: 18,
      maxSize: 42,
      bold: true,
      italic: false,
    },
    align: 'left',
    lineHeight: 1.12,
    color: '#18221D',
    wrap: true,
    autoShrink: true,
    ellipsis: true,
  };
}

function createQrField(offset: number, template: Template): QRField {
  const size = Math.min(
    180,
    template.background.width * 0.25,
    template.background.height * 0.35,
  );
  return {
    id: crypto.randomUUID(),
    name: 'QR-код',
    type: 'qr',
    source: 'productUrl',
    rect: {
      x: clamp(
        template.background.width - size - 40 - offset,
        0,
        Math.max(0, template.background.width - size),
      ),
      y: clamp(
        template.background.height - size - 40 - offset,
        0,
        Math.max(0, template.background.height - size),
      ),
      width: size,
      height: size,
    },
    zIndex: nextZIndex(template.fields),
    size,
    margin: 1,
    whiteBackground: true,
    errorCorrectionLevel: 'M',
  };
}

function nextZIndex(fields: Field[]): number {
  return Math.max(0, ...fields.map((field) => field.zIndex)) + 1;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function requireApi() {
  if (!window.stickerGenerator) {
    throw new Error(
      'Приложение запущено без Electron API. Откройте его командой npm run dev.',
    );
  }
  return window.stickerGenerator;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Произошла неизвестная ошибка.';
}
