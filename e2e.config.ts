import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

export default {
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
} satisfies E2EConfig;
