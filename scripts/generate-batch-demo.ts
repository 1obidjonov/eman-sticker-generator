import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BatchExportEngine,
  ParserEngine,
  ParserRegistry,
  PlaywrightBrowserPool,
  PlaywrightTextMeasurementService,
  SchemaOrgProductParser,
  SharpRasterizer,
  type Template,
} from '../src/index.js';
import type { GenerationProgress } from '../src/shared/ipc-contract.js';
import { launchApplicationBrowser } from '../src/main/services/BrowserFactory.js';
import { GenerationService } from '../src/main/services/GenerationService.js';

const projectRoot = resolve(process.cwd());
const outputDirectory = resolve(projectRoot, 'examples/output');
const templateDirectory = resolve(projectRoot, 'examples/basic-template');
const template = JSON.parse(
  await readFile(resolve(templateDirectory, 'template.json'), 'utf8'),
) as Template;
const background = await readFile(
  resolve(templateDirectory, template.background.filePath),
);
const backgroundMime =
  template.background.format === 'svg'
    ? 'image/svg+xml'
    : template.background.format === 'jpg'
      ? 'image/jpeg'
      : 'image/png';
const backgroundDataUrl =
  `data:${backgroundMime};base64,${background.toString('base64')}`;

const products = [
  {
    slug: 'tokyo-white',
    name: 'Акрил AGT Tokyo White 2800×1220×18',
    price: '1485000',
    sku: 'AGT-3075',
  },
  {
    slug: 'spectrum-light',
    name: 'Акрил AGT Spectrum Light 2800×1220×18',
    price: '1530000',
    sku: 'AGT-6023',
  },
  {
    slug: 'deluxe-grey',
    name: 'Акрил AGT Deluxe Grey 2800×1220×18',
    price: '1515000',
    sku: 'AGT-6008',
  },
];

const server = createServer((request, response) => {
  const product = products.find(
    (candidate) => request.url === `/products/${candidate.slug}`,
  );
  if (!product) {
    response.statusCode = 404;
    response.end('Not found');
    return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`
    <!doctype html>
    <title>${product.name}</title>
    <script type="application/ld+json">
      ${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.name,
        sku: product.sku,
        brand: { '@type': 'Brand', name: 'AGT' },
        offers: {
          '@type': 'Offer',
          price: product.price,
          priceCurrency: 'UZS',
        },
      })}
    </script>
  `);
});

await new Promise<void>((resolvePromise) => {
  server.listen(0, '127.0.0.1', resolvePromise);
});
const address = server.address();
if (!address || typeof address === 'string') {
  throw new Error('Не удалось запустить локальный demo-сайт.');
}
const baseUrl = `http://127.0.0.1:${address.port}`;

const browserPool = new PlaywrightBrowserPool(
  () => launchApplicationBrowser(),
  { maxPages: 2 },
);

try {
  const registry = new ParserRegistry().register(
    new SchemaOrgProductParser(),
  );
  const parserEngine = new ParserEngine(registry, browserPool, {
    allowPrivateHosts: true,
  });
  const generationService = new GenerationService(
    {
      async open() {
        return template;
      },
      async getBackground() {
        return {
          dataUrl: backgroundDataUrl,
          width: template.background.width,
          height: template.background.height,
        };
      },
    },
    parserEngine,
    new PlaywrightTextMeasurementService(browserPool),
    2,
  );

  let resolveCompletion: (progress: GenerationProgress) => void =
    () => undefined;
  const completion = new Promise<GenerationProgress>((resolvePromise) => {
    resolveCompletion = resolvePromise;
  });
  generationService.onProgress((progress) => {
    if (progress.status === 'completed') {
      resolveCompletion(progress);
    }
  });

  const handle = await generationService.start({
    templateId: template.id,
    urls: products.map(
      (product) => `${baseUrl}/products/${product.slug}`,
    ),
  });
  const progress = await completion;
  const stickers = generationService.getCompletedStickers(handle.jobId);

  await mkdir(outputDirectory, { recursive: true });
  const archive = await new BatchExportEngine(
    new SharpRasterizer(),
  ).exportZip({
    outputPath: resolve(outputDirectory, 'demo-batch.zip'),
    formats: ['svg', 'png', 'jpg'],
    scale: 2,
    quality: 90,
    stickers: stickers.map(({ product, svg }) => ({
      name: `${product.sku ?? 'product'}-${product.name}`,
      svg,
    })),
  });
  await writeFile(
    resolve(outputDirectory, 'demo-batch-summary.json'),
    `${JSON.stringify(
      {
        progress,
        products: stickers.map(({ product }) => product),
        archive: {
          fileName: 'demo-batch.zip',
          bytes: archive.bytes,
          formats: archive.formats,
        },
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `Batch generated: ${stickers.length}/${progress.total}, ${archive.outputPath}`,
  );
} finally {
  await browserPool.close();
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error) => (error ? reject(error) : resolvePromise()));
  });
}
