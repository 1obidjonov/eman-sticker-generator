import type { FontSettings } from '../../shared/types/index.js';

export function toCanvasFont(font: FontSettings): string {
  const style = font.italic ? 'italic' : 'normal';
  const weight = font.bold ? '700' : '400';
  const family = quoteFontFamily(font.family);
  return `${style} ${weight} ${font.size}px ${family}`;
}

function quoteFontFamily(family: string): string {
  const genericFamilies = new Set([
    'cursive',
    'fantasy',
    'monospace',
    'sans-serif',
    'serif',
    'system-ui',
  ]);

  if (genericFamilies.has(family.toLowerCase()) || family.includes(',')) {
    return family;
  }

  if (/^[a-z][\w -]*$/i.test(family)) {
    return `"${family.replaceAll('"', '\\"')}"`;
  }
  return family;
}
