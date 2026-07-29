export type FieldId = string;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BaseField {
  id: FieldId;
  name: string;
  rect: Rect;
  zIndex: number;
}

export type TextSource = 'productName' | 'price' | 'sku' | 'custom';

export interface FontSettings {
  family: string;
  size: number;
  minSize: number;
  maxSize: number;
  bold: boolean;
  italic: boolean;
}

export interface TextField extends BaseField {
  type: 'text';
  source: TextSource;
  customText?: string;
  font: FontSettings;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  color: string;
  wrap: boolean;
  autoShrink: boolean;
  ellipsis: boolean;
}

export interface QRField extends BaseField {
  type: 'qr';
  source: 'productUrl' | 'customText';
  customValue?: string;
  size: number;
  margin: number;
  whiteBackground: boolean;
  errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H';
}

export type Field = TextField | QRField;
