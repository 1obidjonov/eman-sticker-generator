import { describe, expect, it } from 'vitest';
import {
  TemplateValidationError,
  assertValidTemplate,
  validateTemplate,
} from '../src/index.js';
import { createTemplate } from './fixtures.js';

describe('TemplateValidator', () => {
  it('accepts a valid template', () => {
    expect(validateTemplate(createTemplate())).toEqual([]);
    expect(() => assertValidTemplate(createTemplate())).not.toThrow();
  });

  it('rejects duplicate ids and invalid dimensions', () => {
    const template = createTemplate();
    template.fields.push({ ...template.fields[0]!, rect: { x: 0, y: 0, width: 0, height: 20 } });

    const issues = validateTemplate(template);

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'fields[2].id', severity: 'error' }),
        expect.objectContaining({ path: 'fields[2].rect', severity: 'error' }),
      ]),
    );
    expect(() => assertValidTemplate(template)).toThrow(
      TemplateValidationError,
    );
  });

  it('reports out-of-bounds fields as a warning, not an error', () => {
    const template = createTemplate();
    template.fields[0]!.rect.x = 390;

    const issues = validateTemplate(template);

    expect(issues).toContainEqual(
      expect.objectContaining({
        path: 'fields[0].rect',
        severity: 'warning',
      }),
    );
    expect(() => assertValidTemplate(template)).not.toThrow();
  });
});
