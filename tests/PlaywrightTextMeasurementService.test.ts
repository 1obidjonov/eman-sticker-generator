import type { Browser, Page } from 'playwright-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PlaywrightTextMeasurementService,
  SinglePlaywrightPageProvider,
  type FontSettings,
} from '../src/index.js';
import { launchApplicationBrowser } from '../src/main/services/BrowserFactory.js';

describe('PlaywrightTextMeasurementService', () => {
  let browser: Browser | undefined;
  let page: Page | undefined;
  let service: PlaywrightTextMeasurementService;

  beforeAll(async () => {
    browser = await launchApplicationBrowser();
    page = await browser.newPage();
    await page.setContent('<!doctype html><html><body></body></html>');
    service = new PlaywrightTextMeasurementService(
      new SinglePlaywrightPageProvider(page),
    );
  }, 30_000);

  afterAll(async () => {
    await page?.close();
    await browser?.close();
  }, 30_000);

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
