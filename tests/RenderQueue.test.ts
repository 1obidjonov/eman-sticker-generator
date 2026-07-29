import { describe, expect, it } from 'vitest';
import {
  RenderQueue,
  type QueueProgress,
} from '../src/core/queue/index.js';

describe('RenderQueue', () => {
  it('limits concurrency and reports a completed job', async () => {
    const queue = new RenderQueue<number, number>(2);
    let active = 0;
    let maximumActive = 0;
    const values: number[] = [];
    const final = completionPromise();

    queue.enqueue(
      [1, 2, 3, 4, 5],
      async (value) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await delay(8);
        active -= 1;
        return value * 2;
      },
      {
        onItem(result) {
          if (result.status === 'fulfilled') {
            values.push(result.value);
          }
        },
        onProgress: final.observe,
      },
    );

    const progress = await final.promise;
    expect(maximumActive).toBe(2);
    expect(values.sort((a, b) => a - b)).toEqual([2, 4, 6, 8, 10]);
    expect(progress).toMatchObject({
      status: 'completed',
      total: 5,
      completed: 5,
      succeeded: 5,
      failed: 0,
      active: 0,
      pending: 0,
    });
  });

  it('isolates item failures and keeps processing the queue', async () => {
    const queue = new RenderQueue<number, number>(3);
    const final = completionPromise();

    queue.enqueue(
      [1, 2, 3],
      async (value) => {
        if (value === 2) {
          throw new Error('Broken item');
        }
        return value;
      },
      { onProgress: final.observe },
    );

    const progress = await final.promise;
    expect(progress.succeeded).toBe(2);
    expect(progress.failed).toBe(1);
    expect(progress.completed).toBe(3);
  });

  it('cancels active workers without counting them as failures', async () => {
    const queue = new RenderQueue<number, number>(2);
    const canceled = new Promise<QueueProgress>((resolve) => {
      const handle = queue.enqueue(
        [1, 2, 3, 4],
        async (_value, context) =>
          new Promise<number>((workerResolve, workerReject) => {
            const timer = setTimeout(() => workerResolve(1), 500);
            context.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                workerReject(new Error('aborted'));
              },
              { once: true },
            );
          }),
        {
          onProgress(progress) {
            if (progress.status === 'running' && progress.active === 2) {
              queue.cancel(handle.jobId);
            }
            if (progress.status === 'canceled' && progress.active === 0) {
              resolve(progress);
            }
          },
        },
      );
    });

    const progress = await canceled;
    expect(progress.status).toBe('canceled');
    expect(progress.succeeded).toBe(0);
    expect(progress.failed).toBe(0);
  });

  it('allows a job to override the default concurrency', async () => {
    const queue = new RenderQueue<number, number>(1);
    let active = 0;
    let maximumActive = 0;
    const final = completionPromise();

    queue.enqueue(
      [1, 2, 3, 4],
      async (value) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await delay(8);
        active -= 1;
        return value;
      },
      { onProgress: final.observe },
      3,
    );

    await final.promise;
    expect(maximumActive).toBe(3);
  });
});

function completionPromise(): {
  promise: Promise<QueueProgress>;
  observe(progress: QueueProgress): void;
} {
  let resolvePromise: (value: QueueProgress) => void = () => undefined;
  const promise = new Promise<QueueProgress>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    observe(progress) {
      if (progress.status === 'completed') {
        resolvePromise(progress);
      }
    },
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
