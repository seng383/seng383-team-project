const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  // The spec files share one seeded database, and link-specialist.spec.js links the coach for a while,
  // which would give a parallel check of the unlinked coach a 200, so they run one after another.
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
  },
  // Starts the seeded API and the Vite dev server before the tests run.
  webServer: [
    {
      command: 'npm run seed && npm start -w server',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -w client',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
  ],
});
