import type {
  Field,
  Product,
  QRField,
  Template,
  TextField,
} from '../../shared/types/index.js';
import { assertValidTemplate } from '../template/TemplateValidator.js';
import { fitText } from './text-fit.js';
import { DefaultQRFieldRenderer } from './qr-field-renderer.js';
import type {
  ComposeStickerDependencies,
  ComposeWarning,
  ComposedSVGDocument,
  FieldRenderResult,
} from './types.js';

export async function composeSticker(
  template: Template,
  product: Product,
  dependencies: ComposeStickerDependencies,
): Promise<ComposedSVGDocument> {
  assertValidTemplate(template);

  const backgroundHref = await dependencies.backgroundResolver.resolve(
    template.background,
  );
  const qrRenderer =
    dependencies.qrFieldRenderer ?? new DefaultQRFieldRenderer();
  const warnings: ComposeWarning[] = [];
  const fieldResults: FieldRenderResult[] = [];
  const fragments: string[] = [];
  const fields = [...template.fields].sort(
    (left, right) => left.zIndex - right.zIndex,
  );

  for (const field of fields) {
    if (field.type === 'text') {
      const value = resolveTextValue(field, product);
      if (!value) {
        warnings.push(emptyValueWarning(field));
      }

      const fit = await fitText(
        value,
        field,
        field.rect,
        dependencies.textMeasurementService,
      );

      if (fit.overflow) {
        warnings.push({
          fieldId: field.id,
          fieldName: field.name,
          code: 'text-overflow',
          message: `Text does not fit into field "${field.name}".`,
        });
      }

      fragments.push(renderTextField(field, fit.size, fit.lines));
      fieldResults.push({ type: 'text', fieldId: field.id, fit });
      continue;
    }

    const value = resolveQrValue(field, product);
    if (!value) {
      warnings.push(emptyValueWarning(field));
      fieldResults.push({ type: 'qr', fieldId: field.id, rendered: false });
      continue;
    }

    const dataUri = await qrRenderer.render(value, field);
    fragments.push(renderQrField(field, dataUri));
    fieldResults.push({ type: 'qr', fieldId: field.id, rendered: true });
  }

  const { width, height } = template.background;
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <image id="background-layer" href="${escapeXmlAttribute(backgroundHref)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none"/>`,
    '  <g id="fields-layer">',
    ...fragments.map((fragment) => `    ${fragment}`),
    '  </g>',
    '</svg>',
  ].join('\n');

  return {
    svg,
    width,
    height,
    warnings,
    fields: fieldResults,
  };
}

function resolveTextValue(field: TextField, product: Product): string {
  switch (field.source) {
    case 'productName':
      return product.name;
    case 'price':
      return product.price ?? '';
    case 'sku':
      return product.sku ?? '';
    case 'custom':
      return field.customText ?? '';
  }
}

function resolveQrValue(field: QRField, product: Product): string {
  return field.source === 'productUrl'
    ? product.url
    : field.customValue ?? '';
}

function renderTextField(
  field: TextField,
  size: number,
  lines: string[],
): string {
  const x =
    field.align === 'left'
      ? field.rect.x
      : field.align === 'center'
        ? field.rect.x + field.rect.width / 2
        : field.rect.x + field.rect.width;
  const anchor =
    field.align === 'left'
      ? 'start'
      : field.align === 'center'
        ? 'middle'
        : 'end';
  const weight = field.font.bold ? '700' : '400';
  const style = field.font.italic ? 'italic' : 'normal';
  const lineAdvance = size * field.lineHeight;
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : lineAdvance;
      return `<tspan x="${x}" dy="${dy}">${escapeXmlText(line)}</tspan>`;
    })
    .join('');

  return [
    `<text data-field-id="${escapeXmlAttribute(field.id)}"`,
    `x="${x}" y="${field.rect.y}"`,
    `font-family="${escapeXmlAttribute(field.font.family)}"`,
    `font-size="${size}" font-weight="${weight}" font-style="${style}"`,
    `fill="${escapeXmlAttribute(field.color)}" text-anchor="${anchor}"`,
    `dominant-baseline="text-before-edge" xml:space="preserve">${tspans}</text>`,
  ].join(' ');
}

function renderQrField(field: QRField, dataUri: string): string {
  const size = Math.min(field.size, field.rect.width, field.rect.height);
  const x = field.rect.x + (field.rect.width - size) / 2;
  const y = field.rect.y + (field.rect.height - size) / 2;
  return `<image data-field-id="${escapeXmlAttribute(field.id)}" href="${escapeXmlAttribute(dataUri)}" x="${x}" y="${y}" width="${size}" height="${size}"/>`;
}

function emptyValueWarning(field: Field): ComposeWarning {
  return {
    fieldId: field.id,
    fieldName: field.name,
    code: 'empty-value',
    message: `Field "${field.name}" has no value.`,
  };
}

function escapeXmlText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value)
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
