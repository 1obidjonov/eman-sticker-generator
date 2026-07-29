import type { Field, QRField, Template, TextField } from '../../shared/types/index.js';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  path: string;
  message: string;
}

export class TemplateValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(
      `Template validation failed:\n${issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join('\n')}`,
    );
    this.name = 'TemplateValidationError';
  }
}

const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i;

export function validateTemplate(template: Template): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!template.id.trim()) {
    issues.push(error('id', 'Template id is required.'));
  }

  if (!template.name.trim()) {
    issues.push(error('name', 'Template name is required.'));
  }

  if (!isIsoDate(template.createdAt)) {
    issues.push(error('createdAt', 'Expected a valid ISO date.'));
  }

  if (!isIsoDate(template.updatedAt)) {
    issues.push(error('updatedAt', 'Expected a valid ISO date.'));
  }

  if (template.background.width <= 0 || template.background.height <= 0) {
    issues.push(error('background', 'Background dimensions must be positive.'));
  }

  if (!template.background.filePath.trim()) {
    issues.push(error('background.filePath', 'Background file path is required.'));
  }

  const fieldIds = new Set<string>();
  template.fields.forEach((field, index) => {
    const path = `fields[${index}]`;

    if (fieldIds.has(field.id)) {
      issues.push(error(`${path}.id`, `Duplicate field id "${field.id}".`));
    }
    fieldIds.add(field.id);

    validateBaseField(field, path, template, issues);

    if (field.type === 'text') {
      validateTextField(field, path, issues);
    } else {
      validateQrField(field, path, issues);
    }
  });

  return issues;
}

export function assertValidTemplate(template: Template): void {
  const errors = validateTemplate(template).filter(
    (issue) => issue.severity === 'error',
  );

  if (errors.length > 0) {
    throw new TemplateValidationError(errors);
  }
}

function validateBaseField(
  field: Field,
  path: string,
  template: Template,
  issues: ValidationIssue[],
): void {
  if (!field.id.trim()) {
    issues.push(error(`${path}.id`, 'Field id is required.'));
  }

  if (!field.name.trim()) {
    issues.push(error(`${path}.name`, 'Field name is required.'));
  }

  const values = [
    field.rect.x,
    field.rect.y,
    field.rect.width,
    field.rect.height,
    field.zIndex,
  ];

  if (values.some((value) => !Number.isFinite(value))) {
    issues.push(error(path, 'Field coordinates and z-index must be finite numbers.'));
    return;
  }

  if (field.rect.width <= 0 || field.rect.height <= 0) {
    issues.push(error(`${path}.rect`, 'Field dimensions must be positive.'));
  }

  const outside =
    field.rect.x < 0 ||
    field.rect.y < 0 ||
    field.rect.x + field.rect.width > template.background.width ||
    field.rect.y + field.rect.height > template.background.height;

  if (outside) {
    issues.push(
      warning(
        `${path}.rect`,
        'Field extends outside the background and may be clipped on export.',
      ),
    );
  }
}

function validateTextField(
  field: TextField,
  path: string,
  issues: ValidationIssue[],
): void {
  if (!field.font.family.trim()) {
    issues.push(error(`${path}.font.family`, 'Font family is required.'));
  }

  if (
    field.font.minSize <= 0 ||
    field.font.maxSize <= 0 ||
    field.font.size <= 0
  ) {
    issues.push(error(`${path}.font`, 'Font sizes must be positive.'));
  }

  if (field.font.minSize > field.font.maxSize) {
    issues.push(error(`${path}.font`, 'minSize cannot be greater than maxSize.'));
  }

  if (
    field.font.size < field.font.minSize ||
    field.font.size > field.font.maxSize
  ) {
    issues.push(
      warning(
        `${path}.font.size`,
        'Default size is outside minSize/maxSize and will be clamped.',
      ),
    );
  }

  if (field.lineHeight <= 0) {
    issues.push(error(`${path}.lineHeight`, 'Line height must be positive.'));
  }

  if (!HEX_COLOR.test(field.color)) {
    issues.push(error(`${path}.color`, 'Expected a hex color such as #0D9C5B.'));
  }

  if (field.source === 'custom' && field.customText === undefined) {
    issues.push(
      warning(
        `${path}.customText`,
        'Custom text source has no customText value.',
      ),
    );
  }
}

function validateQrField(
  field: QRField,
  path: string,
  issues: ValidationIssue[],
): void {
  if (field.size <= 0) {
    issues.push(error(`${path}.size`, 'QR size must be positive.'));
  }

  if (field.margin < 0) {
    issues.push(error(`${path}.margin`, 'QR margin cannot be negative.'));
  }

  if (field.source === 'customText' && field.customValue === undefined) {
    issues.push(
      warning(
        `${path}.customValue`,
        'Custom QR source has no customValue.',
      ),
    );
  }
}

function isIsoDate(value: string): boolean {
  return Boolean(value && !Number.isNaN(Date.parse(value)));
}

function error(path: string, message: string): ValidationIssue {
  return { severity: 'error', path, message };
}

function warning(path: string, message: string): ValidationIssue {
  return { severity: 'warning', path, message };
}
