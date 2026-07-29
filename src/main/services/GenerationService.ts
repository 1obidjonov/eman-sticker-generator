import { EventEmitter } from 'node:events';
import {
  composeSticker,
  type TextMeasurementService,
} from '../../core/renderer-engine/index.js';
import type { ParserEngine } from '../../core/parsers/index.js';
import {
  RenderQueue,
  type QueueProgress,
} from '../../core/queue/index.js';
import type {
  GeneratedStickerPreview,
  GenerationJobHandle,
  GenerationJobSnapshot,
  GenerationProgress,
  GenerationRequest,
} from '../../shared/ipc-contract.js';
import type { Product, Template } from '../../shared/types/index.js';

export interface GenerationTemplateSource {
  open(id: string): Promise<Template>;
  getBackground(id: string): Promise<{
    dataUrl: string;
    width: number;
    height: number;
  }>;
}

export interface CompletedSticker {
  index: number;
  product: Product;
  svg: string;
}

interface GenerationJob {
  template: Template;
  urls: string[];
  progress: GenerationProgress;
  items: GeneratedStickerPreview[];
}

interface GenerationEvents {
  progress: [GenerationProgress];
  item: [GeneratedStickerPreview];
}

export class GenerationService {
  private readonly queue: RenderQueue<string, GeneratedStickerPreview>;
  private readonly jobs = new Map<string, GenerationJob>();
  private readonly events = new EventEmitter<GenerationEvents>();

  constructor(
    private readonly templates: GenerationTemplateSource,
    private readonly parserEngine: ParserEngine,
    private readonly textMeasurementService: TextMeasurementService,
    concurrency = 4,
  ) {
    this.queue = new RenderQueue(concurrency);
  }

  async start(request: GenerationRequest): Promise<GenerationJobHandle> {
    const urls = normalizeUrls(request.urls);
    const [template, background] = await Promise.all([
      this.templates.open(request.templateId),
      this.templates.getBackground(request.templateId),
    ]);

    const handle = this.queue.enqueue(
      urls,
      async (url, context) => {
        throwIfAborted(context.signal);
        const product = await this.parserEngine.parse(url);
        throwIfAborted(context.signal);
        const composed = await composeSticker(template, product, {
          backgroundResolver: {
            async resolve() {
              return background.dataUrl;
            },
          },
          textMeasurementService: this.textMeasurementService,
        });
        throwIfAborted(context.signal);

        return {
          jobId: context.jobId,
          index: context.index,
          url,
          status: 'completed',
          product,
          svg: composed.svg,
          width: composed.width,
          height: composed.height,
          warnings: composed.warnings,
        };
      },
      {
        onProgress: (progress) => this.handleProgress(progress),
        onItem: (result) => {
          const job = this.jobs.get(result.jobId);
          if (!job) {
            return;
          }
          const item: GeneratedStickerPreview =
            result.status === 'fulfilled'
              ? result.value
              : {
                  jobId: result.jobId,
                  index: result.index,
                  url: job.urls[result.index] ?? '',
                  status: 'failed',
                  error: result.error.message,
                };
          job.items[result.index] = item;
          this.events.emit('item', structuredClone(item));
        },
      },
      request.concurrency,
    );

    const progress: GenerationProgress = {
      jobId: handle.jobId,
      status: 'queued',
      total: urls.length,
      completed: 0,
      succeeded: 0,
      failed: 0,
      active: 0,
      pending: urls.length,
    };
    this.jobs.set(handle.jobId, {
      template,
      urls,
      progress,
      items: urls.map((url, index) => ({
        jobId: handle.jobId,
        index,
        url,
        status: 'queued',
      })),
    });
    this.pruneFinishedJobs();
    return handle;
  }

  cancel(jobId: string): void {
    this.requireJob(jobId);
    this.queue.cancel(jobId);
  }

  getJob(jobId: string): GenerationJobSnapshot {
    const job = this.requireJob(jobId);
    return structuredClone({
      progress: job.progress,
      items: job.items,
    });
  }

  getCompletedStickers(jobId: string): CompletedSticker[] {
    const job = this.requireJob(jobId);
    return job.items
      .filter(
        (
          item,
        ): item is Extract<
          GeneratedStickerPreview,
          { status: 'completed' }
        > => item.status === 'completed',
      )
      .map((item) => ({
        index: item.index,
        product: item.product,
        svg: item.svg,
      }));
  }

  getTemplateName(jobId: string): string {
    return this.requireJob(jobId).template.name;
  }

  onProgress(
    listener: (progress: GenerationProgress) => void,
  ): () => void {
    this.events.on('progress', listener);
    return () => this.events.off('progress', listener);
  }

  onItem(
    listener: (item: GeneratedStickerPreview) => void,
  ): () => void {
    this.events.on('item', listener);
    return () => this.events.off('item', listener);
  }

  private handleProgress(progress: QueueProgress): void {
    const job = this.jobs.get(progress.jobId);
    if (!job) {
      return;
    }
    const next: GenerationProgress = {
      jobId: progress.jobId,
      status: progress.status,
      total: progress.total,
      completed: progress.completed,
      succeeded: progress.succeeded,
      failed: progress.failed,
      active: progress.active,
      pending: progress.pending,
    };
    job.progress = next;
    this.events.emit('progress', structuredClone(next));
  }

  private requireJob(jobId: string): GenerationJob {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Задача генерации не найдена.');
    }
    return job;
  }

  private pruneFinishedJobs(): void {
    if (this.jobs.size <= 20) {
      return;
    }
    for (const [jobId, job] of this.jobs) {
      if (
        this.jobs.size <= 20 ||
        job.progress.status === 'running' ||
        job.progress.status === 'queued'
      ) {
        continue;
      }
      this.jobs.delete(jobId);
      try {
        this.queue.forget(jobId);
      } catch {
        // The record remains harmless until the next pruning pass.
      }
    }
  }
}

function normalizeUrls(urls: string[]): string[] {
  if (!Array.isArray(urls)) {
    throw new Error('Список ссылок должен быть массивом.');
  }
  const normalized = [
    ...new Set(
      urls
        .map((url) => (typeof url === 'string' ? url.trim() : ''))
        .filter(Boolean),
    ),
  ];
  if (normalized.length === 0) {
    throw new Error('Добавьте хотя бы одну ссылку на товар.');
  }
  if (normalized.length > 1_000) {
    throw new Error('За один запуск можно обработать до 1000 ссылок.');
  }
  return normalized;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new Error('Генерация отменена.');
  }
}
