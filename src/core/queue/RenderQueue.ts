import { randomUUID } from 'node:crypto';

export type QueueJobStatus = 'queued' | 'running' | 'completed' | 'canceled';

export interface QueueProgress {
  jobId: string;
  status: QueueJobStatus;
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  active: number;
  pending: number;
}

export interface QueueWorkerContext {
  jobId: string;
  index: number;
  signal: AbortSignal;
}

export type QueueItemResult<TOutput> =
  | {
      status: 'fulfilled';
      jobId: string;
      index: number;
      value: TOutput;
    }
  | {
      status: 'rejected';
      jobId: string;
      index: number;
      error: Error;
    };

export interface QueueObservers<TOutput> {
  onProgress?(progress: QueueProgress): void;
  onItem?(result: QueueItemResult<TOutput>): void;
}

export interface QueueJobHandle {
  jobId: string;
  total: number;
}

export type QueueWorker<TInput, TOutput> = (
  item: TInput,
  context: QueueWorkerContext,
) => Promise<TOutput>;

interface InternalJob<TInput, TOutput> {
  id: string;
  items: TInput[];
  worker: QueueWorker<TInput, TOutput>;
  observers: QueueObservers<TOutput>;
  controller: AbortController;
  status: QueueJobStatus;
  nextIndex: number;
  completed: number;
  succeeded: number;
  failed: number;
  active: number;
  concurrency: number;
}

export class RenderQueue<TInput, TOutput> {
  private readonly jobs = new Map<string, InternalJob<TInput, TOutput>>();

  constructor(private readonly concurrency = 4) {
    if (
      !Number.isInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > 32
    ) {
      throw new Error('Конкурентность очереди должна быть от 1 до 32.');
    }
  }

  enqueue(
    items: TInput[],
    worker: QueueWorker<TInput, TOutput>,
    observers: QueueObservers<TOutput> = {},
    concurrency = this.concurrency,
  ): QueueJobHandle {
    if (items.length === 0) {
      throw new Error('Нельзя запустить пустую очередь.');
    }
    assertConcurrency(concurrency);

    const id = randomUUID();
    const job: InternalJob<TInput, TOutput> = {
      id,
      items: [...items],
      worker,
      observers,
      controller: new AbortController(),
      status: 'queued',
      nextIndex: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      active: 0,
      concurrency,
    };
    this.jobs.set(id, job);

    queueMicrotask(() => {
      if (!job.controller.signal.aborted) {
        job.status = 'running';
      }
      this.notify(job);
      void this.run(job);
    });

    return { jobId: id, total: items.length };
  }

  cancel(jobId: string): void {
    const job = this.requireJob(jobId);
    if (job.status === 'completed' || job.status === 'canceled') {
      return;
    }
    job.status = 'canceled';
    job.controller.abort();
    this.notify(job);
  }

  getProgress(jobId: string): QueueProgress {
    return toProgress(this.requireJob(jobId));
  }

  forget(jobId: string): void {
    const job = this.requireJob(jobId);
    if (job.status === 'running' || job.active > 0) {
      throw new Error('Нельзя удалить выполняющуюся задачу.');
    }
    this.jobs.delete(jobId);
  }

  private async run(job: InternalJob<TInput, TOutput>): Promise<void> {
    if (job.controller.signal.aborted) {
      return;
    }

    const workerCount = Math.min(job.concurrency, job.items.length);
    await Promise.all(
      Array.from({ length: workerCount }, () => this.runWorker(job)),
    );

    if (job.controller.signal.aborted) {
      job.status = 'canceled';
    } else {
      job.status = 'completed';
    }
    this.notify(job);
  }

  private async runWorker(job: InternalJob<TInput, TOutput>): Promise<void> {
    while (!job.controller.signal.aborted) {
      const index = job.nextIndex;
      if (index >= job.items.length) {
        return;
      }
      job.nextIndex += 1;
      const item = job.items[index];
      if (item === undefined) {
        return;
      }

      job.active += 1;
      this.notify(job);
      if (job.controller.signal.aborted) {
        job.active -= 1;
        this.notify(job);
        return;
      }
      try {
        const value = await job.worker(item, {
          jobId: job.id,
          index,
          signal: job.controller.signal,
        });
        if (!job.controller.signal.aborted) {
          job.succeeded += 1;
          job.completed += 1;
          job.observers.onItem?.({
            status: 'fulfilled',
            jobId: job.id,
            index,
            value,
          });
        }
      } catch (error) {
        if (!job.controller.signal.aborted) {
          job.failed += 1;
          job.completed += 1;
          job.observers.onItem?.({
            status: 'rejected',
            jobId: job.id,
            index,
            error: toError(error),
          });
        }
      } finally {
        job.active -= 1;
        this.notify(job);
      }
    }
  }

  private notify(job: InternalJob<TInput, TOutput>): void {
    job.observers.onProgress?.(toProgress(job));
  }

  private requireJob(jobId: string): InternalJob<TInput, TOutput> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error('Задача очереди не найдена.');
    }
    return job;
  }
}

function assertConcurrency(concurrency: number): void {
  if (
    !Number.isInteger(concurrency) ||
    concurrency < 1 ||
    concurrency > 32
  ) {
    throw new Error('Конкурентность очереди должна быть от 1 до 32.');
  }
}

function toProgress<TInput, TOutput>(
  job: InternalJob<TInput, TOutput>,
): QueueProgress {
  return {
    jobId: job.id,
    status: job.status,
    total: job.items.length,
    completed: job.completed,
    succeeded: job.succeeded,
    failed: job.failed,
    active: job.active,
    pending: Math.max(
      0,
      job.items.length - job.completed - job.active,
    ),
  };
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
