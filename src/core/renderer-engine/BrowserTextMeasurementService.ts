import type { FontSettings } from '../../shared/types/index.js';
import { toCanvasFont } from './font.js';
import type {
  TextMeasurement,
  TextMeasurementService,
} from './types.js';

/**
 * Renderer-process implementation. The same browser canvas metrics are used by
 * the hidden Playwright pages during headless generation.
 */
export class BrowserTextMeasurementService
  implements TextMeasurementService
{
  private readonly context: CanvasRenderingContext2D;

  constructor() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas 2D context is unavailable.');
    }

    this.context = context;
  }

  async measure(
    text: string,
    font: FontSettings,
  ): Promise<TextMeasurement> {
    this.context.font = toCanvasFont(font);
    const metrics = this.context.measureText(text);
    const measuredHeight =
      metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

    return {
      width: metrics.width,
      height: measuredHeight || font.size,
    };
  }
}
