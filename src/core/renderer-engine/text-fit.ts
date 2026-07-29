import type { FontSettings } from '../../shared/types/index.js';
import type {
  FitResult,
  TextFitBox,
  TextFitField,
  TextMeasurement,
  TextMeasurementService,
} from './types.js';

const EPSILON = 0.01;
const ELLIPSIS = '…';

interface Layout {
  lines: string[];
  widths: number[];
}

export async function fitText(
  text: string,
  field: TextFitField,
  box: TextFitBox,
  service: TextMeasurementService,
): Promise<FitResult> {
  const minimum = field.font.minSize;
  const maximum = field.font.maxSize;
  const sizes = field.autoShrink
    ? descendingSizes(maximum, minimum)
    : [maximum];
  const cache = new Map<string, TextMeasurement>();

  const measure = async (
    value: string,
    size: number,
  ): Promise<TextMeasurement> => {
    const key = `${size}\u0000${value}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const measurement = await service.measure(value, withSize(field.font, size));
    cache.set(key, measurement);
    return measurement;
  };

  for (const size of sizes) {
    const layout = await layoutText(text, size, field.wrap, box.width, measure);
    if (fits(layout, size, field.lineHeight, box)) {
      return {
        size,
        lines: layout.lines,
        lineWidths: layout.widths,
        truncated: false,
        overflow: false,
      };
    }
  }

  const fallbackSize = field.autoShrink ? minimum : maximum;
  const fallback = await layoutText(
    text,
    fallbackSize,
    field.wrap,
    box.width,
    measure,
  );

  if (!field.ellipsis) {
    return {
      size: fallbackSize,
      lines: fallback.lines,
      lineWidths: fallback.widths,
      truncated: false,
      overflow: true,
    };
  }

  return ellipsizeLayout(
    fallback,
    fallbackSize,
    field.lineHeight,
    box,
    measure,
  );
}

function descendingSizes(maximum: number, minimum: number): number[] {
  const sizes: number[] = [];
  let current = maximum;

  while (current > minimum) {
    sizes.push(current);
    current = Math.max(minimum, current - 1);
  }

  sizes.push(minimum);
  return [...new Set(sizes)];
}

async function layoutText(
  text: string,
  size: number,
  wrap: boolean,
  maxWidth: number,
  measure: (value: string, size: number) => Promise<TextMeasurement>,
): Promise<Layout> {
  const paragraphs = text.replaceAll('\r\n', '\n').split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (!wrap) {
      lines.push(paragraph);
      continue;
    }

    lines.push(...(await wrapParagraph(paragraph, size, maxWidth, measure)));
  }

  const normalizedLines = lines.length > 0 ? lines : [''];
  const widths = await Promise.all(
    normalizedLines.map(async (line) => (await measure(line, size)).width),
  );

  return { lines: normalizedLines, widths };
}

async function wrapParagraph(
  paragraph: string,
  size: number,
  maxWidth: number,
  measure: (value: string, size: number) => Promise<TextMeasurement>,
): Promise<string[]> {
  const words = paragraph.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) {
    return [''];
  }

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const candidateWidth = (await measure(candidate, size)).width;

    if (candidateWidth <= maxWidth + EPSILON) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
      current = '';
    }

    if ((await measure(word, size)).width <= maxWidth + EPSILON) {
      current = word;
      continue;
    }

    const pieces = await breakLongToken(word, size, maxWidth, measure);
    lines.push(...pieces.slice(0, -1));
    current = pieces.at(-1) ?? '';
  }

  if (current || lines.length === 0) {
    lines.push(current);
  }

  return lines;
}

async function breakLongToken(
  token: string,
  size: number,
  maxWidth: number,
  measure: (value: string, size: number) => Promise<TextMeasurement>,
): Promise<string[]> {
  const graphemes = segmentGraphemes(token);
  const pieces: string[] = [];
  let current = '';

  for (const grapheme of graphemes) {
    const candidate = current + grapheme;
    if (
      current &&
      (await measure(candidate, size)).width > maxWidth + EPSILON
    ) {
      pieces.push(current);
      current = grapheme;
    } else {
      current = candidate;
    }
  }

  if (current) {
    pieces.push(current);
  }

  return pieces.length > 0 ? pieces : [''];
}

function fits(
  layout: Layout,
  size: number,
  lineHeight: number,
  box: TextFitBox,
): boolean {
  const widest = Math.max(0, ...layout.widths);
  const height = layout.lines.length * size * lineHeight;
  return widest <= box.width + EPSILON && height <= box.height + EPSILON;
}

async function ellipsizeLayout(
  layout: Layout,
  size: number,
  lineHeight: number,
  box: TextFitBox,
  measure: (value: string, size: number) => Promise<TextMeasurement>,
): Promise<FitResult> {
  const maximumLines = Math.floor(
    (box.height + EPSILON) / (size * lineHeight),
  );

  if (maximumLines < 1) {
    return {
      size,
      lines: [ELLIPSIS],
      lineWidths: [(await measure(ELLIPSIS, size)).width],
      truncated: true,
      overflow: true,
    };
  }

  const visibleLines = layout.lines.slice(0, maximumLines);
  const contentWasClamped = layout.lines.length > maximumLines;
  const lastIndex = visibleLines.length - 1;

  if (lastIndex < 0) {
    visibleLines.push('');
  }

  for (let index = 0; index < visibleLines.length; index += 1) {
    const line = visibleLines[index] ?? '';
    const lineWidth = (await measure(line, size)).width;
    const mustShowEllipsis =
      index === lastIndex && (contentWasClamped || lineWidth > box.width + EPSILON);

    if (mustShowEllipsis || lineWidth > box.width + EPSILON) {
      visibleLines[index] = await truncateWithEllipsis(
        line,
        size,
        box.width,
        measure,
      );
    }
  }

  const widths = await Promise.all(
    visibleLines.map(async (line) => (await measure(line, size)).width),
  );
  const overflow =
    Math.max(0, ...widths) > box.width + EPSILON ||
    visibleLines.length * size * lineHeight > box.height + EPSILON;

  return {
    size,
    lines: visibleLines,
    lineWidths: widths,
    truncated: true,
    overflow,
  };
}

async function truncateWithEllipsis(
  text: string,
  size: number,
  maxWidth: number,
  measure: (value: string, size: number) => Promise<TextMeasurement>,
): Promise<string> {
  if ((await measure(ELLIPSIS, size)).width > maxWidth + EPSILON) {
    return ELLIPSIS;
  }

  const graphemes = segmentGraphemes(text);
  let low = 0;
  let high = graphemes.length;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = `${graphemes.slice(0, middle).join('')}${ELLIPSIS}`;
    if ((await measure(candidate, size)).width <= maxWidth + EPSILON) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return `${graphemes.slice(0, low).join('').trimEnd()}${ELLIPSIS}`;
}

function segmentGraphemes(text: string): string[] {
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  return [...segmenter.segment(text)].map((entry) => entry.segment);
}

function withSize(font: FontSettings, size: number): FontSettings {
  return { ...font, size };
}
