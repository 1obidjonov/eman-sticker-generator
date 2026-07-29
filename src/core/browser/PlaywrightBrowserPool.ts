import type {
  Browser,
  BrowserContext,
  Page,
} from 'playwright-core';
import type {
  PlaywrightPageProvider,
} from '../renderer-engine/PlaywrightTextMeasurementService.js';

export type BrowserFactory = () => Promise<Browser>;

export interface PlaywrightBrowserPoolOptions {
  maxPages?: number;
}

interface PageWaiter {
  resolve(page: Page): void;
  reject(error: Error): void;
}

/**
 * A lazy, bounded pool shared by parsers and headless text measurement.
 * One browser context is reused for the entire application session.
 */
export class PlaywrightBrowserPool implements PlaywrightPageProvider {
  private readonly maxPages: number;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private initializing: Promise<void> | null = null;
  private availablePages: Page[] = [];
  private waiters: PageWaiter[] = [];
  private createdPages = 0;
  private closed = false;

  constructor(
    private readonly browserFactory: BrowserFactory,
    options: PlaywrightBrowserPoolOptions = {},
  ) {
    const maxPages = options.maxPages ?? 4;
    if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 12) {
      throw new Error('Размер Playwright-пула должен быть от 1 до 12.');
    }
    this.maxPages = maxPages;
  }

  async withPage<T>(task: (page: Page) => Promise<T>): Promise<T> {
    const page = await this.acquire();
    try {
      return await task(page);
    } finally {
      this.release(page);
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    const error = new Error('Playwright-пул закрыт.');
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(error);
    }

    const context = this.context;
    const browser = this.browser;
    this.context = null;
    this.browser = null;
    this.availablePages = [];
    this.createdPages = 0;

    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }

  private async acquire(): Promise<Page> {
    if (this.closed) {
      throw new Error('Playwright-пул уже закрыт.');
    }
    await this.initialize();

    const available = this.availablePages.pop();
    if (available) {
      return available;
    }

    if (this.createdPages < this.maxPages) {
      this.createdPages += 1;
      try {
        return await this.requireContext().newPage();
      } catch (error) {
        this.createdPages -= 1;
        throw error;
      }
    }

    return new Promise<Page>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  private release(page: Page): void {
    if (this.closed || page.isClosed()) {
      this.createdPages = Math.max(0, this.createdPages - 1);
      const waiter = this.waiters.shift();
      if (waiter && !this.closed) {
        this.createdPages += 1;
        void this.requireContext()
          .newPage()
          .then(waiter.resolve)
          .catch((error: unknown) => {
            this.createdPages = Math.max(0, this.createdPages - 1);
            waiter.reject(toError(error));
          });
      }
      return;
    }

    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve(page);
      return;
    }
    this.availablePages.push(page);
  }

  private async initialize(): Promise<void> {
    if (this.context) {
      return;
    }
    if (!this.initializing) {
      this.initializing = this.createContext();
    }
    await this.initializing;
  }

  private async createContext(): Promise<void> {
    let browser: Browser | null = null;
    try {
      browser = await this.browserFactory();
      if (this.closed) {
        await browser.close();
        throw new Error('Playwright-пул закрыт во время запуска.');
      }
      this.browser = browser;
      this.context = await browser.newContext({
        locale: 'ru-RU',
        serviceWorkers: 'block',
      });
    } catch (error) {
      await browser?.close().catch(() => undefined);
      this.browser = null;
      this.context = null;
      throw error;
    } finally {
      this.initializing = null;
    }
  }

  private requireContext(): BrowserContext {
    if (!this.context) {
      throw new Error('Контекст Playwright не инициализирован.');
    }
    return this.context;
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
