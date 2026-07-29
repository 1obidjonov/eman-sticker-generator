import { describe, expect, it } from 'vitest';
import { fitText, type TextField } from '../src/index.js';
import { DeterministicTextMeasurementService } from './fixtures.js';

const service = new DeterministicTextMeasurementService();

function field(overrides: Partial<TextField> = {}): TextField {
  return {
    id: 'text',
    name: 'Text',
    type: 'text',
    source: 'productName',
    rect: { x: 0, y: 0, width: 100, height: 50 },
    zIndex: 1,
    font: {
      family: 'Arial',
      size: 20,
      minSize: 8,
      maxSize: 20,
      bold: false,
      italic: false,
    },
    align: 'left',
    lineHeight: 1,
    color: '#000000',
    wrap: false,
    autoShrink: true,
    ellipsis: true,
    ...overrides,
  };
}

describe('fitText', () => {
  it('shrinks in one-pixel steps until text fits', async () => {
    const result = await fitText(
      'abcdefghij',
      field(),
      { width: 60, height: 30 },
      service,
    );

    expect(result.size).toBe(10);
    expect(result.lines).toEqual(['abcdefghij']);
    expect(result.overflow).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('wraps words and respects available height', async () => {
    const result = await fitText(
      'one two three',
      field({
        font: {
          family: 'Arial',
          size: 10,
          minSize: 10,
          maxSize: 10,
          bold: false,
          italic: false,
        },
        wrap: true,
        autoShrink: false,
      }),
      { width: 42, height: 20 },
      service,
    );

    expect(result.lines).toEqual(['one two', 'three']);
    expect(result.overflow).toBe(false);
  });

  it('applies ellipsis only after fitting and wrapping fail', async () => {
    const result = await fitText(
      'abcdefghij',
      field({
        font: {
          family: 'Arial',
          size: 10,
          minSize: 10,
          maxSize: 10,
          bold: false,
          italic: false,
        },
        autoShrink: false,
      }),
      { width: 30, height: 10 },
      service,
    );

    expect(result.lines).toEqual(['abcd…']);
    expect(result.truncated).toBe(true);
    expect(result.overflow).toBe(false);
  });

  it('reports overflow when even an ellipsis is too tall', async () => {
    const result = await fitText(
      'abc',
      field({
        font: {
          family: 'Arial',
          size: 10,
          minSize: 10,
          maxSize: 10,
          bold: false,
          italic: false,
        },
        autoShrink: false,
      }),
      { width: 30, height: 5 },
      service,
    );

    expect(result.truncated).toBe(true);
    expect(result.overflow).toBe(true);
  });
});
