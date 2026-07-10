import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { PrismaClient } from '@prisma/client';

process.env.NODE_ENV = 'test';
process.env.NX9_STORAGE = 'json';
process.env.NX9_DATA_DIR = 'F:\\code\\project\\NX9\\apps\\server\\data';
process.env.NX9_IMAGES_DIR = 'F:\\code\\project\\NX9\\apps\\server\\data\\images';
process.env.NX9_VIDEOS_DIR = 'F:\\code\\project\\NX9\\apps\\server\\data\\videos';
process.env.NX9_AUDIO_DIR = 'F:\\code\\project\\NX9\\apps\\server\\data\\audio';
process.env.NX9_EXPORTS_DIR = 'F:\\code\\project\\NX9\\apps\\server\\data\\exports';

// Global setup — runs before all tests
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
