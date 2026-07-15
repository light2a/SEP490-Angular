/**
 * Sinh src/environments/environment.prod.ts từ biến môi trường API_BASE.
 * - Local: đọc file .env ở gốc repo (gitignored) nếu biến chưa set.
 * - Vercel: set env var API_BASE trong dashboard (Settings → Environment Variables).
 * Chạy trước ng build (script "build" trong package.json). Không set API_BASE → giữ nguyên file hiện có.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const envFile = join(root, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}

const apiBase = process.env['API_BASE'];
if (!apiBase) {
  console.warn('[set-env] API_BASE chưa set (env var hoặc .env) — giữ nguyên environment.prod.ts hiện có.');
  process.exit(0);
}

const target = join(root, 'src/environments/environment.prod.ts');
writeFileSync(
  target,
  `/** FILE SINH TỰ ĐỘNG bởi scripts/set-env.mjs — đừng sửa tay, đổi API_BASE trong .env / Vercel env var. */
export const environment = {
  production: true,
  apiBase: '${apiBase}',
};
`,
);
console.log(`[set-env] environment.prod.ts ← apiBase = ${apiBase}`);
