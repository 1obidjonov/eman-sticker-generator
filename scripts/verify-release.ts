import { access, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

interface PackageManifest {
  name: string;
  productName?: string;
  version: string;
  main: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface PackageLock {
  packages?: Record<
    string,
    {
      version?: string;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    }
  >;
}

interface ReleaseCheck {
  name: string;
  status: 'passed' | 'failed';
  detail: string;
}

const projectRoot = process.cwd();
const manifest = JSON.parse(
  await readFile(join(projectRoot, 'package.json'), 'utf8'),
) as PackageManifest;
const checks: ReleaseCheck[] = [];

await check('Production main process', async () => {
  await access(join(projectRoot, manifest.main));
  return manifest.main;
});

await check('Production preload', async () => {
  const path = join(projectRoot, 'dist/src/preload.cjs');
  await access(path);
  return 'dist/src/preload.cjs';
});

await check('Renderer bundle', async () => {
  const path = join(projectRoot, 'dist/renderer/index.html');
  await access(path);
  return 'dist/renderer/index.html';
});

await check('Application icon', async () => {
  const metadata = await sharp(join(projectRoot, 'build/icon.png')).metadata();
  if (
    metadata.format !== 'png' ||
    metadata.width !== 1024 ||
    metadata.height !== 1024
  ) {
    throw new Error('Icon must be a 1024×1024 PNG.');
  }
  return `${metadata.width}×${metadata.height} PNG`;
});

await check('Electron Builder configuration', async () => {
  const [config, portableConfig] = await Promise.all([
    readFile(join(projectRoot, 'electron-builder.yml'), 'utf8'),
    readFile(join(projectRoot, 'electron-builder-portable.yml'), 'utf8'),
  ]);
  for (const required of [
    'appId: uz.eman.stickergenerator',
    'target: nsis',
    'deleteAppDataOnUninstall: false',
    'asar: true',
  ]) {
    if (!config.includes(required)) {
      throw new Error(`Missing release setting: ${required}`);
    }
  }
  if (
    !portableConfig.includes(
      'Eman-Sticker-Generator-Portable-${version}-${arch}.${ext}',
    )
  ) {
    throw new Error('Portable artifact name is not isolated.');
  }
  return 'NSIS and portable x64, ASAR, user data preserved';
});

await check('Packaging toolchain', async () => {
  await access(
    join(projectRoot, 'node_modules/electron-builder/out/cli/cli.js'),
  );
  return `electron-builder ${manifest.devDependencies?.['electron-builder'] ?? 'installed'}`;
});

await check('Production Chromium dependency', async () => {
  if (!manifest.dependencies?.['@sparticuz/chromium']) {
    throw new Error('@sparticuz/chromium must be a production dependency.');
  }
  if (manifest.devDependencies?.['@sparticuz/chromium']) {
    throw new Error('@sparticuz/chromium cannot remain a dev dependency.');
  }
  const archive = join(
    projectRoot,
    'node_modules/@sparticuz/chromium/bin/chromium.br',
  );
  const bytes = (await stat(archive)).size;
  if (bytes < 40 * 1024 * 1024) {
    throw new Error('Bundled Chromium archive is missing or incomplete.');
  }
  return `${formatBytes(bytes)} compressed browser`;
});

await check('Patched production libraries', async () => {
  const archiverVersion = manifest.dependencies?.archiver ?? '';
  const sharpVersion = manifest.dependencies?.sharp ?? '';
  if (!/^[~^]?8\./.test(archiverVersion)) {
    throw new Error('Archiver 8.x or newer is required.');
  }
  if (!/^[~^]?0\.(?:3[5-9]|[4-9]\d)\./.test(sharpVersion)) {
    throw new Error('Sharp 0.35.x or newer is required.');
  }
  return `archiver ${archiverVersion}, sharp ${sharpVersion}`;
});

await check('Application metadata', async () => {
  if (manifest.productName !== 'Eman Sticker Generator') {
    throw new Error('Product name is not configured.');
  }
  if (!/^0\.8\.\d+-rc\.\d+$/.test(manifest.version)) {
    throw new Error('Stage 8 must use an 0.8.x-rc.N version.');
  }
  return `${manifest.productName} ${manifest.version}`;
});

await check('Lockfile consistency', async () => {
  const lock = JSON.parse(
    await readFile(join(projectRoot, 'package-lock.json'), 'utf8'),
  ) as PackageLock;
  const root = lock.packages?.[''];
  if (root?.version !== manifest.version) {
    throw new Error(
      `package-lock version ${root?.version ?? 'missing'} does not match ${manifest.version}.`,
    );
  }
  if (
    root.dependencies?.['@sparticuz/chromium'] !==
    manifest.dependencies?.['@sparticuz/chromium']
  ) {
    throw new Error('Production dependencies differ from package-lock.json.');
  }
  return `package-lock.json ${root.version}`;
});

await check('Production security policy', async () => {
  const [windowSource, html] = await Promise.all([
    readFile(join(projectRoot, 'src/main/window.ts'), 'utf8'),
    readFile(join(projectRoot, 'index.html'), 'utf8'),
  ]);
  for (const required of [
    'contextIsolation: true',
    'sandbox: true',
    'nodeIntegration: false',
    "action: 'deny'",
    'Content-Security-Policy',
  ]) {
    if (!windowSource.includes(required) && !html.includes(required)) {
      throw new Error(`Missing production security setting: ${required}`);
    }
  }
  return 'sandbox, isolated preload, navigation denied, CSP';
});

await check('Packaged runtime smoke-test', async () => {
  const [bootstrapSource, mainSource, smokeService] = await Promise.all([
    readFile(join(projectRoot, 'src/main/bootstrap.ts'), 'utf8'),
    readFile(join(projectRoot, 'src/main/index.ts'), 'utf8'),
    readFile(
      join(projectRoot, 'src/main/services/SmokeTestService.ts'),
      'utf8',
    ),
  ]);
  for (const required of [
    '--smoke-test',
    '--smoke-user-data-dir',
    'STICKER_SMOKE_TEST',
    'STICKER_SMOKE_BOOTSTRAP_LOG',
    'writeSmokeTestReport',
    'Preload bridge',
  ]) {
    if (
      !bootstrapSource.includes(required) &&
      !mainSource.includes(required) &&
      !smokeService.includes(required)
    ) {
      throw new Error(`Missing runtime smoke capability: ${required}`);
    }
  }
  return 'bootstrap, env/argv activation, renderer, preload bridge';
});

await check('Release integrity tooling', async () => {
  for (const path of [
    'dist/scripts/generate-sbom.js',
    'dist/scripts/finalize-release.js',
    'dist/scripts/verify-packaged-asar.js',
    'dist/scripts/verify-release-artifacts.js',
    'dist/src/core/release/ReleaseArtifactEngine.js',
  ]) {
    await access(join(projectRoot, path));
  }
  const requiredScripts = [
    'release:sbom',
    'release:finalize:win',
    'release:verify-artifacts:win',
    'release:validate-windows-rc',
  ];
  const scripts = (
    manifest as PackageManifest & { scripts?: Record<string, string> }
  ).scripts;
  for (const script of requiredScripts) {
    if (!scripts?.[script]) {
      throw new Error(`Missing package script: ${script}`);
    }
  }
  return 'CycloneDX SBOM, SHA-256 manifest, artifact verification';
});

await check('Windows RC lifecycle validation', async () => {
  const script = await readFile(
    join(projectRoot, 'scripts/windows-rc-validation.ps1'),
    'utf8',
  );
  for (const required of [
    'Get-AuthenticodeSignature',
    'Silent NSIS installation',
    'Installed application runtime',
    'Restart persistence',
    'Silent NSIS uninstall',
    'User data preservation',
    'ReportPath',
  ]) {
    if (!script.includes(required)) {
      throw new Error(`Missing Windows RC lifecycle gate: ${required}`);
    }
  }
  return 'install, two packaged launches, persistence, uninstall, signature';
});

await check('CI workflows', async () => {
  const [quality, windowsRelease] = await Promise.all([
    readFile(join(projectRoot, '.github/workflows/quality.yml'), 'utf8'),
    readFile(
      join(projectRoot, '.github/workflows/windows-release.yml'),
      'utf8',
    ),
  ]);
  for (const required of [
    'actions/checkout@v7',
    'actions/setup-node@v7',
    'actions/upload-artifact@v6',
    'npm run audit:prod',
    'npm run release:verify-artifacts:win',
    'Smoke-test packaged application',
    'Validate installed application lifecycle',
    'windows-lifecycle-report.json',
    'Publishing requires a valid Authenticode signature',
    'git rev-list -n 1',
  ]) {
    if (!quality.includes(required) && !windowsRelease.includes(required)) {
      throw new Error(`Missing CI release gate: ${required}`);
    }
  }
  return 'quality gate and Windows tagged release';
});

await check('Release documentation', async () => {
  await Promise.all([
    access(join(projectRoot, 'docs/PILOT_TEST_CHECKLIST.md')),
    access(join(projectRoot, 'docs/WINDOWS_RELEASE.md')),
    access(join(projectRoot, 'docs/CI_CD_RELEASE.md')),
    access(join(projectRoot, 'docs/RC_RUNBOOK.md')),
    access(
      join(projectRoot, `docs/RELEASE_NOTES_${manifest.version}.md`),
    ),
  ]);
  return 'pilot checklist, RC runbook, CI/CD guide, Windows guide, release notes';
});

const failed = checks.filter((item) => item.status === 'failed');
const report = {
  generatedAt: new Date().toISOString(),
  productName: manifest.productName,
  version: manifest.version,
  platform: process.platform,
  architecture: process.arch,
  status: failed.length === 0 ? 'passed' : 'failed',
  checks,
  packagingNote:
    'Windows NSIS устанавливается, дважды smoke-тестируется и удаляется workflow windows-release на Windows runner.',
};

const releaseDirectory = join(projectRoot, 'release');
await mkdir(releaseDirectory, { recursive: true });
const reportPath = join(releaseDirectory, 'release-verification.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

for (const item of checks) {
  console.log(
    `${item.status === 'passed' ? 'PASS' : 'FAIL'} ${item.name}: ${item.detail}`,
  );
}
console.log(`Release report: ${reportPath}`);

if (failed.length > 0) {
  process.exitCode = 1;
}

async function check(
  name: string,
  task: () => Promise<string>,
): Promise<void> {
  try {
    checks.push({ name, status: 'passed', detail: await task() });
  } catch (error) {
    checks.push({
      name,
      status: 'failed',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
