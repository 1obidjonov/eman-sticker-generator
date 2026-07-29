import { readFile } from 'node:fs/promises';

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Reads only the root <svg> size metadata. It does not build a DOM, inspect
 * designer layers, or modify any source content.
 */
export async function readSvgDimensions(path: string): Promise<ImageDimensions> {
  const source = await readFile(path, 'utf8');
  const rootMatch = source.match(/<svg\b([^>]*)>/i);
  if (!rootMatch) {
    throw new Error('Файл не содержит корневой элемент SVG.');
  }
  const root = rootMatch[1] ?? '';

  const width = parseLength(readAttribute(root, 'width'));
  const height = parseLength(readAttribute(root, 'height'));
  if (width && height) {
    return { width, height };
  }

  const viewBox = readAttribute(root, 'viewBox')
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (
    viewBox?.length === 4 &&
    viewBox.every(Number.isFinite) &&
    (viewBox[2] ?? 0) > 0 &&
    (viewBox[3] ?? 0) > 0
  ) {
    return { width: viewBox[2]!, height: viewBox[3]! };
  }

  throw new Error(
    'Не удалось определить размер SVG. Укажите width/height или viewBox при экспорте из Figma.',
  );
}

function readAttribute(source: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(
    new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']+)["']`, 'i'),
  )?.[1];
}

function parseLength(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = value.trim().match(/^(\d+(?:\.\d+)?)(?:px)?$/i);
  if (!match?.[1]) {
    return null;
  }
  const result = Number(match[1]);
  return Number.isFinite(result) && result > 0 ? result : null;
}
