import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

const config: E2EConfig = {
  tests: ['e2e-ta/**/*.e2e.ts', '!e2e-ta/findings/**'],
  targets: [
    {
      name: 'local',
      engine: web(),
      app: {
        url: 'http://127.0.0.1:0',
        command: { executable: 'python3', args: ['-m', 'http.server', '{port}', '--bind', '127.0.0.1', '--directory', 'dist/client'], log: '.e2e/logs/app.log', startupTimeout: 120000 },
      },
    },
  ],
};

if (process.env.E2E_LIVE_URL) {
  const targets = config.targets as any[];
  targets.push({
    name: 'live',
    engine: web(),
    app: {
      url: process.env.E2E_LIVE_URL,
    },
  });
}

export default config;
