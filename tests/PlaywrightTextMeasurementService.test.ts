import chromiumBundle from '@sparticuz/chromium';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Browser } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PlaywrightTextMeasurementService,
  SinglePlaywrightPageProvider,
  type FontSettings,
} from '../src/index.js';
import { resolveBundledChromiumExecutable } from '../src/main/services/BundledChromium.js';

describe('PlaywrightTextMeasurementService', () => {
  let browser: Browser | undefined;
  let service: PlaywrightTextMeasurementService;

  beforeAll(async () => {
    chromiumBundle.setGraphicsMode = false;
    browser = await chromium.launch({
      args: chromiumBundle.args,
      executablePath: await resolveBundledChromiumExecutable(),
      headless: true,
      env: {
        ...process.env,
        XDG_CACHE_HOME: join(tmpdir(), 'sticker-generator-test-cache'),
      },
    });
    const page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    service = new PlaywrightTextMeasurementService(
      new SinglePlaywrightPageProvider(page),
    );
  }, 30_000);

  afterAll(async () => {
    await browser?.close();
  });

  it('uses real Chromium canvas metrics', async () => {
    const font: FontSettings = {
      family: 'Arial',
      size: 32,
      minSize: 12,
      maxSize: 40,
      bold: false,
      italic: false,
    };

    const wide = await service.measure('MMMM', font);
    const narrow = await service.measure('iiii', font);

    expect(wide.width).toBeGreaterThan(narrow.width);
    expect(wide.height).toBeGreaterThan(0);
  });
});
