import type {
  FontSettings,
  IBackgroundAsset,
  QRField,
  Rect,
  TextField,
} from '../../shared/types/index.js';

export interface TextMeasurement {
  width: number;
  height: number;
}

export interface TextMeasurementService {
  measure(text: string, font: FontSettings): Promise<TextMeasurement>;
}

export interface BackgroundResolver {
  resolve(background: IBackgroundAsset): Promise<string>;
}

export interface QRFieldRenderer {
  render(value: string, field: QRField): Promise<string>;
}

export interface FitResult {
  size: number;
  lines: string[];
  lineWidths: number[];
  truncated: boolean;
  overflow: boolean;
}

export interface ComposeWarning {
  fieldId: string;
  fieldName: string;
  code: 'empty-value' | 'text-overflow';
  message: string;
}

export interface TextFieldRenderResult {
  type: 'text';
  fieldId: string;
  fit: FitResult;
}

export interface QRFieldRenderResult {
  type: 'qr';
  fieldId: string;
  rendered: boolean;
}

export type FieldRenderResult = TextFieldRenderResult | QRFieldRenderResult;

export interface ComposedSVGDocument {
  svg: string;
  width: number;
  height: number;
  warnings: ComposeWarning[];
  fields: FieldRenderResult[];
}

export interface ComposeStickerDependencies {
  backgroundResolver: BackgroundResolver;
  textMeasurementService: TextMeasurementService;
  qrFieldRenderer?: QRFieldRenderer;
}

export type TextFitBox = Pick<Rect, 'width' | 'height'>;
export type TextFitField = Pick<
  TextField,
  'font' | 'lineHeight' | 'wrap' | 'autoShrink' | 'ellipsis'
>;
