import path from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PrismaClient } from '@prisma/client';

process.env.NODE_ENV = 'test';
process.env.NX9_STORAGE = 'json';

// 数据目录默认随仓库走（apps/server/data），允许用环境变量覆盖。
// 此前这里硬编码 `F:\code\project\NX9\...`（README 里的旧路径），
// 任何非 F 盘工作区都会在 mkdir 时 ENOENT，导致整个服务端测试套件无法收集。
const DEFAULT_DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_DIR = process.env.NX9_DATA_DIR?.trim() || DEFAULT_DATA_DIR;
process.env.NX9_DATA_DIR = DATA_DIR;
process.env.NX9_IMAGES_DIR = process.env.NX9_IMAGES_DIR?.trim() || path.join(DATA_DIR, 'images');
process.env.NX9_VIDEOS_DIR = process.env.NX9_VIDEOS_DIR?.trim() || path.join(DATA_DIR, 'videos');
process.env.NX9_AUDIO_DIR = process.env.NX9_AUDIO_DIR?.trim() || path.join(DATA_DIR, 'audio');
process.env.NX9_EXPORTS_DIR = process.env.NX9_EXPORTS_DIR?.trim() || path.join(DATA_DIR, 'exports');

// Global setup 鈥?runs before all tests
beforeAll(async () => {
  // Ensure fixture directories exist
  const fs = await import('fs');
  const dirs = [
    process.env.NX9_IMAGES_DIR!,
    process.env.NX9_VIDEOS_DIR!,
    process.env.NX9_AUDIO_DIR!,
    process.env.NX9_EXPORTS_DIR!,
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
});