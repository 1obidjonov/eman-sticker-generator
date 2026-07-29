import type { ParserEngine } from '../src/core/parsers/index.js';
import { GenerationService } from '../src/main/services/GenerationService.js';
import type { Product } from '../src/shared/types/index.js';
import { describe, expect, it } from 'vitest';
import {
  createTemplate,
  DeterministicTextMeasurementService,
} from './fixtures.js';

describe('GenerationService', () => {
  it('generates successful items, isolates parser failures and reports progress', async () => {
    const template = createTemplate();
    const parserEngine = {
      async parse(url: string): Promise<Product> {
        if (url.includes('broken')) {
          throw new Error('Product page is broken');
        }
        return {
          url,
          name: `Product ${url.at(-1)}`,
          price: '100 UZS',
          sku: `SKU-${url.at(-1)}`,
          sourceParser: 'test',
        };
      },
    } as ParserEngine;
    const service = new GenerationService(
      {
        async open() {
          return template;
        },
        async getBackground() {
          return {
            dataUrl:
              'data:image/svg+xml;base64,' +
              Buffer.from(
                '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"/>',
              ).toString('base64'),
            width: 400,
            height: 300,
          };
        },
      },
      parserEngine,
      new DeterministicTextMeasurementService(),
      2,
    );
    const completed = new Promise<void>((resolve) => {
      service.onProgress((progress) => {
        if (progress.status === 'completed') {
          resolve();
        }
      });
    });

    const handle = await service.start({
      templateId: template.id,
      urls: [
        'https://example.com/1',
        'https://example.com/broken',
        'https://example.com/3',
      ],
    });
    await completed;

    const snapshot = service.getJob(handle.jobId);
    expect(snapshot.progress).toMatchObject({
      status: 'completed',
      total: 3,
      succeeded: 2,
      failed: 1,
    });
    expect(snapshot.items.filter((item) => item.status === 'completed')).toHaveLength(
      2,
    );
    expect(snapshot.items[1]).toMatchObject({
      status: 'failed',
      error: 'Product page is broken',
    });
    expect(service.getCompletedStickers(handle.jobId)).toHaveLength(2);
  });

  it('deduplicates URLs before creating the queue', async () => {
    const template = createTemplate();
    const service = new GenerationService(
      {
        async open() {
          return template;
        },
        async getBackground() {
          return {
            dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
            width: 400,
            height: 300,
          };
        },
      },
      {
        async parse(url: string) {
          return { url, name: 'Product', sourceParser: 'test' };
        },
      } as ParserEngine,
      new DeterministicTextMeasurementService(),
      1,
    );

    const handle = await service.start({
      templateId: template.id,
      urls: ['https://example.com/1', ' https://example.com/1 '],
    });
    expect(handle.total).toBe(1);
  });
});
