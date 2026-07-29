import type {
  BackgroundFormat,
  Product,
  Template,
} from './types/index.js';
import type { ComposeWarning } from '../core/renderer-engine/types.js';

export interface TemplateSummary {
  id: string;
  name: string;
  updatedAt: string;
  width: number;
  height: number;
  fieldCount: number;
}

export interface CreateTemplateInput {
  name: string;
}

export interface RenameTemplateInput {
  id: string;
  name: string;
}

export interface TemplateAssetData {
  dataUrl: string;
  format: BackgroundFormat | 'png';
  width: number;
  height: number;
}

export type ExportFormat = 'svg' | 'png' | 'jpg';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface AppSettings {
  schemaVersion: 1;
  theme: ThemePreference;
  defaultExportFormats: ExportFormat[];
  defaultExportScale: number;
  jpgQuality: number;
  revealAfterExport: boolean;
  generationConcurrency: number;
  parserTimeoutSeconds: number;
  browserExecutablePath: string | null;
  compactPreviews: boolean;
  reduceMotion: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 1,
  theme: 'system',
  defaultExportFormats: ['png'],
  defaultExportScale: 2,
  jpgQuality: 90,
  revealAfterExport: false,
  generationConcurrency: 4,
  parserTimeoutSeconds: 35,
  browserExecutablePath: null,
  compactPreviews: false,
  reduceMotion: false,
};

export interface BrowserDiagnostic {
  status: 'ready' | 'error';
  version?: string;
  launchDurationMs: number;
  message?: string;
}

export interface AppDiagnostics {
  appVersion: string;
  electronVersion: string;
  chromiumVersion: string;
  nodeVersion: string;
  platform: string;
  architecture: string;
  templatesPath: string;
  userDataPath: string;
  parserCount: number;
  browser: BrowserDiagnostic;
}

export interface SupportBundleResult {
  path: string;
  bytes: number;
}

export interface ExportFileRequest {
  svg: string;
  baseName: string;
  format: ExportFormat;
  scale: number;
  quality: number;
}

export interface ExportZipRequest {
  svg: string;
  baseName: string;
  formats: ExportFormat[];
  scale: number;
  quality: number;
}

export interface ExportResult {
  path: string;
  bytes: number;
  formats: ExportFormat[];
  archived: boolean;
}

export interface ParserDescriptor {
  id: string;
  displayName: string;
  description: string;
}

export type GenerationJobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'canceled';

export interface GenerationRequest {
  templateId: string;
  urls: string[];
  concurrency?: number;
}

export interface GenerationJobHandle {
  jobId: string;
  total: number;
}

export interface GenerationProgress {
  jobId: string;
  status: GenerationJobStatus;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  active: number;
  pending: number;
}

export type GeneratedStickerPreview =
  | {
      jobId: string;
      index: number;
      url: string;
      status: 'queued';
    }
  | {
      jobId: string;
      index: number;
      url: string;
      status: 'completed';
      product: Product;
      svg: string;
      width: number;
      height: number;
      warnings: ComposeWarning[];
    }
  | {
      jobId: string;
      index: number;
      url: string;
      status: 'failed';
      error: string;
    };

export interface GenerationJobSnapshot {
  progress: GenerationProgress;
  items: GeneratedStickerPreview[];
}

export interface GenerationBatchExportRequest {
  jobId: string;
  formats: ExportFormat[];
  scale: number;
  quality: number;
}

export interface StickerGeneratorAPI {
  templates: {
    list(): Promise<TemplateSummary[]>;
    create(input: CreateTemplateInput): Promise<Template | null>;
    open(id: string): Promise<Template>;
    rename(input: RenameTemplateInput): Promise<Template>;
    delete(id: string): Promise<void>;
    save(template: Template): Promise<Template>;
    getBackground(id: string): Promise<TemplateAssetData>;
    getThumbnail(id: string): Promise<TemplateAssetData>;
  };
  export: {
    saveFile(request: ExportFileRequest): Promise<ExportResult | null>;
    saveZip(request: ExportZipRequest): Promise<ExportResult | null>;
    reveal(path: string): Promise<void>;
  };
  parsers: {
    listAvailable(): Promise<ParserDescriptor[]>;
  };
  generation: {
    start(request: GenerationRequest): Promise<GenerationJobHandle>;
    cancel(jobId: string): Promise<void>;
    getJob(jobId: string): Promise<GenerationJobSnapshot>;
    exportAll(
      request: GenerationBatchExportRequest,
    ): Promise<ExportResult | null>;
    reveal(path: string): Promise<void>;
    onProgress(
      jobId: string,
      listener: (progress: GenerationProgress) => void,
    ): () => void;
    onItem(
      jobId: string,
      listener: (item: GeneratedStickerPreview) => void,
    ): () => void;
  };
  settings: {
    get(): Promise<AppSettings>;
    update(patch: Partial<AppSettings>): Promise<AppSettings>;
    reset(): Promise<AppSettings>;
    chooseBrowserExecutable(): Promise<string | null>;
    getDiagnostics(): Promise<AppDiagnostics>;
    revealDataDirectory(): Promise<void>;
    revealLogsDirectory(): Promise<void>;
    createSupportBundle(): Promise<SupportBundleResult | null>;
    revealSupportBundle(path: string): Promise<void>;
  };
}

export const IPC_CHANNELS = {
  templates: {
    list: 'templates:list',
    create: 'templates:create',
    open: 'templates:open',
    rename: 'templates:rename',
    delete: 'templates:delete',
    save: 'templates:save',
    getBackground: 'templates:get-background',
    getThumbnail: 'templates:get-thumbnail',
  },
  export: {
    saveFile: 'export:save-file',
    saveZip: 'export:save-zip',
    reveal: 'export:reveal',
  },
  parsers: {
    listAvailable: 'parsers:list-available',
  },
  generation: {
    start: 'generation:start',
    cancel: 'generation:cancel',
    getJob: 'generation:get-job',
    exportAll: 'generation:export-all',
    reveal: 'generation:reveal',
    progress: 'generation:progress',
    item: 'generation:item',
  },
  settings: {
    get: 'settings:get',
    update: 'settings:update',
    reset: 'settings:reset',
    chooseBrowserExecutable: 'settings:choose-browser-executable',
    getDiagnostics: 'settings:get-diagnostics',
    revealDataDirectory: 'settings:reveal-data-directory',
    revealLogsDirectory: 'settings:reveal-logs-directory',
    createSupportBundle: 'settings:create-support-bundle',
    revealSupportBundle: 'settings:reveal-support-bundle',
  },
} as const;
