import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Browser } from 'playwright-core';
import chromiumBundle from '@sparticuz/chromium';
import { resolveBundledChromiumExecutable } from './BundledChromium.js';

interface BrowserExecutable {
  executablePath: string;
  args?: string[];
}

export interface ApplicationBrowserOptions {
  executablePath?: string | null;
}

export async function launchApplicationBrowser(
  options: ApplicationBrowserOptions = {},
): Promise<Browser> {
  const executable = await resolveBrowserExecutable(options.executablePath);
  return chromium.launch({
    executablePath: executable.executablePath,
    ...(executable.args ? { args: executable.args } : {}),
    headless: true,
    env: {
      ...process.env,
      XDG_CACHE_HOME: join(tmpdir(), 'sticker-generator-browser-cache'),
    },
  });
}

async function resolveBrowserExecutable(
  selectedPath?: string | null,
): Promise<BrowserExecutable> {
  const configured = selectedPath?.trim() || process.env.STICKER_CHROMIUM_PATH;
  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(
        'Путь STICKER_CHROMIUM_PATH не существует. Укажите Chrome или Chromium.',
      );
    }
    return { executablePath: configured };
  }

  const playwrightPath = chromium.executablePath();
  if (playwrightPath && existsSync(playwrightPath)) {
    return { executablePath: playwrightPath };
  }

  for (const candidate of systemBrowserCandidates()) {
    if (candidate && existsSync(candidate)) {
      return { executablePath: candidate };
    }
  }

  if (process.platform === 'linux') {
    try {
      chromiumBundle.setGraphicsMode = false;
      return {
        executablePath: await resolveBundledChromiumExecutable(),
        args: chromiumBundle.args,
      };
    } catch {
      // The actionable error below covers both a missing package and extraction.
    }
  }

  throw new Error(
    'Не найден Chrome/Chromium для парсинга. Установите Chrome или задайте STICKER_CHROMIUM_PATH.',
  );
}

function systemBrowserCandidates(): Array<string | undefined> {
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env.LOCALAPPDATA;
    return [
      programFiles
        ? `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`
        : undefined,
      programFilesX86
        ? `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`
        : undefined,
      localAppData
        ? `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`
        : undefined,
      programFiles
        ? `${programFiles}\\Microsoft\\Edge\\Application\\msedge.exe`
        : undefined,
      programFilesX86
        ? `${programFilesX86}\\Microsoft\\Edge\\Application\\msedge.exe`
        : undefined,
    ];
  }

  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }

  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
}
