import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
  webServer: [
    {
      command: 'pnpm --filter @nx9/server dev',
      url: 'http://localhost:3001/api/status',
      reuseExistingServer: true,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter @nx9/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120000,
    },
  ],
});
