import { create } from 'zustand';
import {
  DEFAULT_APP_SETTINGS,
  type AppDiagnostics,
  type AppSettings,
  type SupportBundleResult,
} from '../../shared/ipc-contract.js';

type SaveStatus = 'idle' | 'saving' | 'saved';

interface SettingsState {
  settings: AppSettings;
  diagnostics: AppDiagnostics | null;
  lastSupportBundle: SupportBundleResult | null;
  isLoading: boolean;
  isChecking: boolean;
  isExportingSupport: boolean;
  saveStatus: SaveStatus;
  error: string | null;
  initialize(): Promise<void>;
  update(patch: Partial<AppSettings>): Promise<void>;
  reset(): Promise<void>;
  chooseBrowserExecutable(): Promise<void>;
  loadDiagnostics(): Promise<void>;
  revealDataDirectory(): Promise<void>;
  revealLogsDirectory(): Promise<void>;
  createSupportBundle(): Promise<void>;
  revealSupportBundle(): Promise<void>;
  clearError(): void;
}

let currentSettings = structuredClone(DEFAULT_APP_SETTINGS);
let mediaListenerInitialized = false;
let settingsRevision = 0;
let updateSequence: Promise<void> = Promise.resolve();

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: structuredClone(DEFAULT_APP_SETTINGS),
  diagnostics: null,
  lastSupportBundle: null,
  isLoading: true,
  isChecking: false,
  isExportingSupport: false,
  saveStatus: 'idle',
  error: null,

  async initialize() {
    set({ isLoading: true, error: null });
    try {
      const settings = await requireApi().settings.get();
      applyVisualSettings(settings);
      set({
        settings,
        isLoading: false,
        saveStatus: 'idle',
      });
    } catch (error) {
      applyVisualSettings(DEFAULT_APP_SETTINGS);
      set({
        isLoading: false,
        error: toErrorMessage(error),
      });
    }
  },

  async update(patch) {
    const revision = ++settingsRevision;
    const optimistic = {
      ...get().settings,
      ...structuredClone(patch),
      schemaVersion: 1 as const,
    };
    applyVisualSettings(optimistic);
    set({
      settings: optimistic,
      saveStatus: 'saving',
      error: null,
    });

    const operation = updateSequence.then(async () => {
      const settings = await requireApi().settings.update(patch);
      if (revision === settingsRevision) {
        applyVisualSettings(settings);
        set({ settings, saveStatus: 'saved' });
      }
    });
    updateSequence = operation.catch(() => undefined);

    try {
      await operation;
    } catch (error) {
      if (revision === settingsRevision) {
        set({ saveStatus: 'idle', error: toErrorMessage(error) });
      }
    }
  },

  async reset() {
    settingsRevision += 1;
    set({ saveStatus: 'saving', error: null, diagnostics: null });
    try {
      await updateSequence;
      const settings = await requireApi().settings.reset();
      applyVisualSettings(settings);
      set({ settings, saveStatus: 'saved' });
    } catch (error) {
      set({ saveStatus: 'idle', error: toErrorMessage(error) });
    }
  },

  async chooseBrowserExecutable() {
    set({ error: null });
    try {
      const executablePath =
        await requireApi().settings.chooseBrowserExecutable();
      if (executablePath) {
        await get().update({ browserExecutablePath: executablePath });
        set({ diagnostics: null });
      }
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  async loadDiagnostics() {
    if (get().isChecking) {
      return;
    }
    set({ isChecking: true, error: null, diagnostics: null });
    try {
      const diagnostics = await requireApi().settings.getDiagnostics();
      set({ diagnostics, isChecking: false });
    } catch (error) {
      set({
        isChecking: false,
        error: toErrorMessage(error),
      });
    }
  },

  async revealDataDirectory() {
    try {
      await requireApi().settings.revealDataDirectory();
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  async revealLogsDirectory() {
    try {
      await requireApi().settings.revealLogsDirectory();
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  async createSupportBundle() {
    if (get().isExportingSupport) {
      return;
    }
    set({
      isExportingSupport: true,
      lastSupportBundle: null,
      error: null,
    });
    try {
      const bundle = await requireApi().settings.createSupportBundle();
      set({
        isExportingSupport: false,
        ...(bundle ? { lastSupportBundle: bundle } : {}),
      });
    } catch (error) {
      set({
        isExportingSupport: false,
        error: toErrorMessage(error),
      });
    }
  },

  async revealSupportBundle() {
    const bundle = get().lastSupportBundle;
    if (!bundle) {
      return;
    }
    try {
      await requireApi().settings.revealSupportBundle(bundle.path);
    } catch (error) {
      set({ error: toErrorMessage(error) });
    }
  },

  clearError() {
    set({ error: null });
  },
}));

function applyVisualSettings(settings: AppSettings): void {
  currentSettings = settings;
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(settings);
  root.dataset.previewDensity = settings.compactPreviews
    ? 'compact'
    : 'comfortable';
  root.dataset.reduceMotion = settings.reduceMotion ? 'true' : 'false';
  root.style.colorScheme =
    settings.theme === 'system' ? 'light dark' : settings.theme;

  if (!mediaListenerInitialized) {
    mediaListenerInitialized = true;
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if (currentSettings.theme === 'system') {
          document.documentElement.dataset.theme =
            resolveTheme(currentSettings);
        }
      });
  }
}

function resolveTheme(settings: AppSettings): 'light' | 'dark' {
  if (settings.theme === 'dark') {
    return 'dark';
  }
  if (settings.theme === 'light') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

function requireApi() {
  if (!window.stickerGenerator) {
    throw new Error('Настройки доступны только в настольном приложении.');
  }
  return window.stickerGenerator;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Не удалось сохранить настройки.';
}
