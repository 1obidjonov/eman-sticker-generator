import type { Page } from 'playwright-core';
import type { FontSettings } from '../../shared/types/index.js';
import { toCanvasFont } from './font.js';
import type {
  TextMeasurement,
  TextMeasurementService,
} from './types.js';

/**
 * The provider is intentionally tiny so the ParserEngine browser pool can own
 * Chromium's lifecycle and lend pages to this service at Stage 4.
 */
export interface PlaywrightPageProvider {
  withPage<T>(task: (page: Page) => Promise<T>): Promise<T>;
}

export class PlaywrightTextMeasurementService
  implements TextMeasurementService
{
  constructor(private readonly pageProvider: PlaywrightPageProvider) {}

  async measure(
    text: string,
    font: FontSettings,
  ): Promise<TextMeasurement> {
    const cssFont = toCanvasFont(font);

    return this.pageProvider.withPage((page) =>
      page.evaluate(
        ({ value, canvasFont, fallbackHeight }) => {
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          if (!context) {
            throw new Error('Canvas 2D context is unavailable in Chromium.');
          }

          context.font = canvasFont;
          const metrics = context.measureText(value);
          const measuredHeight =
            metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

          return {
            width: metrics.width,
            height: measuredHeight || fallbackHeight,
          };
        },
        { value: text, canvasFont: cssFont, fallbackHeight: font.size },
      ),
    );
  }
}

/**
 * Useful for the initial core, tests and CLI demos. The production app will
 * replace this with the shared bounded BrowserPool from ParserEngine.
 */
export class SinglePlaywrightPageProvider implements PlaywrightPageProvider {
  constructor(private readonly page: Page) {}

  async withPage<T>(task: (page: Page) => Promise<T>): Promise<T> {
    return task(this.page);
  }
}
