import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // 도메인은 node, 화면은 jsdom. 도메인 테스트에 DOM 을 끌고 들어가지 않는다.
    environmentMatchGlobs: [['src/ui/**', 'jsdom']],
    setupFiles: ['src/ui/__tests__/setup.ts'],
  },
});
