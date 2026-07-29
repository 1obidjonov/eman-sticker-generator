import type { StickerGeneratorAPI } from '../shared/ipc-contract.js';

declare global {
  interface Window {
    stickerGenerator?: StickerGeneratorAPI;
  }
}

export {};
