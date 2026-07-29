import { readFile } from 'node:fs/promises';
import type {
  BackgroundFormat,
  IBackgroundAsset,
} from '../../shared/types/index.js';
import type { BackgroundResolver } from '../renderer-engine/types.js';

const MIME_BY_FORMAT: Record<BackgroundFormat, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
};

/**
 * Reads the complete background and embeds it as a data URI.
 * SVG content is never parsed or modified.
 */
export class FileBackgroundResolver implements BackgroundResolver {
  async resolve(background: IBackgroundAsset): Promise<string> {
    const bytes = await readFile(background.filePath);
    const mime = MIME_BY_FORMAT[background.format];
    return `data:${mime};base64,${bytes.toString('base64')}`;
  }
}
