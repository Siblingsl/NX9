/**
 * 生成 NX9 品牌图标（古铜金渐变圆角方块 + NX9 字母组合，纯 SVG 路径，无字体依赖）。
 * 输出 apps/desktop/build/icon.png（1024x1024），electron-builder 会据此自动生成 .ico。
 * 用法：node apps/desktop/scripts/gen-icon.mjs
 */
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const rootDir = resolve(import.meta.dirname, '..', '..', '..');

// sharp 是 @nx9/server 的依赖，不在 desktop 内；从 pnpm store 定位加载
function resolveSharp() {
  const candidates = [
    join(rootDir, 'node_modules', '.pnpm', 'sharp@0.34.5', 'node_modules', 'sharp'),
    join(rootDir, 'apps', 'server', 'node_modules', 'sharp'),
  ];
  const found = candidates.find((p) => existsSync(join(p, 'package.json')));
  if (!found) {
    console.error('[gen-icon] 未找到 sharp，请先 pnpm install（@nx9/server 依赖 sharp）');
    process.exit(1);
  }
  return require(found);
}

const sharp = resolveSharp();

const desktopDir = resolve(import.meta.dirname, '..');
const outDir = join(desktopDir, 'build');
mkdirSync(outDir, { recursive: true });

const SIZE = 1024;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#C4A574"/>
      <stop offset="55%" stop-color="#A67C4A"/>
      <stop offset="100%" stop-color="#7D5A33"/>
    </linearGradient>
    <linearGradient id="fg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFF7EE"/>
      <stop offset="100%" stop-color="#F3E7D3"/>
    </linearGradient>
  </defs>
  <!-- 圆角底 -->
  <rect x="32" y="32" width="${SIZE - 64}" height="${SIZE - 64}" rx="196" fill="url(#bg)"/>
  <!-- 内描边 -->
  <rect x="84" y="84" width="${SIZE - 168}" height="${SIZE - 168}" rx="150" fill="none" stroke="#FFF7EE" stroke-opacity="0.18" stroke-width="10"/>
  <!-- N（白色笔画） -->
  <path d="M 300 730 L 300 294 L 724 730 L 724 294"
        fill="none" stroke="url(#fg)" stroke-width="112" stroke-linecap="round" stroke-linejoin="round"/>
  <!-- 9（右上） -->
  <ellipse cx="640" cy="512" rx="120" ry="140" fill="none" stroke="url(#fg)" stroke-width="96"/>
  <path d="M 640 652 C 640 764 712 812 800 812"
        fill="none" stroke="url(#fg)" stroke-width="96" stroke-linecap="round"/>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(join(outDir, 'icon.png'));
console.log(`[gen-icon] 已生成 ${join(outDir, 'icon.png')}`);
