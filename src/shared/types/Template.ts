import type { Field } from './Field.js';

export type BackgroundFormat = 'svg' | 'png' | 'jpg';

export interface IBackgroundAsset {
  format: BackgroundFormat;
  filePath: string;
  width: number;
  height: number;
}

export interface Template {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  background: IBackgroundAsset;
  fields: Field[];
}
