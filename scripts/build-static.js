import { copyFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTPUT = path.join(ROOT, 'public');
const STATIC_FILES = [
  'app.js',
  'auth.js',
  'dashboard.css',
  'dashboard.js',
  'i18n.js',
  'nav.js',
  'payments.js',
  'profile.js',
  'recs.js',
  'script.js',
  'styles.css',
];
const STATIC_ASSETS = [
  'latam-map.webp',
  'nodal-community.webp',
  'nodal-wordmark.webp',
];

await mkdir(OUTPUT, { recursive: true });
await Promise.all(STATIC_FILES.map((file) => copyFile(
  path.join(ROOT, file),
  path.join(OUTPUT, file),
)));
await rm(path.join(OUTPUT, 'assets'), { recursive: true, force: true });
await mkdir(path.join(OUTPUT, 'assets'), { recursive: true });
await Promise.all(STATIC_ASSETS.map((file) => copyFile(
  path.join(ROOT, 'assets', file),
  path.join(OUTPUT, 'assets', file),
)));
