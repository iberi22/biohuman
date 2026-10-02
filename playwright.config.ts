import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e', timeout:60_000, reporter:[['list']],
  use:{baseURL:'http://127.0.0.1:4327',browserName:'chromium',headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/run/current-system/sw/bin/chromium')?'/run/current-system/sw/bin/chromium':undefined)}},
  webServer:{command:'python3 -m http.server 4327 --bind 127.0.0.1 --directory dist/client',url:'http://127.0.0.1:4327',reuseExistingServer:true,timeout:120_000}
});
