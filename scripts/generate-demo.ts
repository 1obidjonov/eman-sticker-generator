import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  FileBackgroundResolver,
  ExportEngine,
  PlaywrightTextMeasurementService,
  SharpRasterizer,
  SinglePlaywrightPageProvider,
  composeSticker,
  type Product,
  type Template,
} from '../src/index.js';
import { launchApplicationBrowser } from '../src/main/services/BrowserFactory.js';

const projectRoot = resolve(process.cwd());
const templateDirectory = resolve(projectRoot, 'examples/basic-template');
const outputDirectory = resolve(projectRoot, 'examples/output');
const templatePath = resolve(templateDirectory, 'template.json');
const template = JSON.parse(
  await readFile(templatePath, 'utf8'),
) as Template;

template.background.filePath = resolve(
  templateDirectory,
  template.background.filePath,
);

const product: Product = {
  url: 'https://example.com/products/agt-tokyo-white',
  name: 'Акрил AGT 2800×1220×18 Tokyo White — премиальная глянцевая панель',
  price: '1 485 000 сум',
  sku: 'Артикул: AGT-TW-18',
  sourceParser: 'demo',
};

const browser = await launchApplicationBrowser();

try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');

  const result = await composeSticker(template, product, {
    backgroundResolver: new FileBackgroundResolver(),
    textMeasurementService: new PlaywrightTextMeasurementService(
      new SinglePlaywrightPageProvider(page),
    ),
  });

  const exportEngine = new ExportEngine(new SharpRasterizer());
  const outputs = [
    await exportEngine.exportFile({
      svg: result.svg,
      outputPath: resolve(outputDirectory, 'demo-sticker.svg'),
      format: 'svg',
    }),
    await exportEngine.exportFile({
      svg: result.svg,
      outputPath: resolve(outputDirectory, 'demo-sticker.png'),
      format: 'png',
      scale: 2,
    }),
    await exportEngine.exportFile({
      svg: result.svg,
      outputPath: resolve(outputDirectory, 'demo-sticker.jpg'),
      format: 'jpg',
      scale: 2,
      quality: 90,
    }),
    await exportEngine.exportZip({
      svg: result.svg,
      outputPath: resolve(outputDirectory, 'demo-sticker.zip'),
      baseName: 'demo-sticker',
      formats: ['svg', 'png', 'jpg'],
      scale: 2,
      quality: 90,
    }),
  ];

  console.log(`Generated: ${outputs.map((output) => output.outputPath).join(', ')}`);
  console.log(`Warnings: ${result.warnings.length}`);
} finally {
  await browser.close();
}
