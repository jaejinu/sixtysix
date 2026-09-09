// 육십육 회귀 테스트 설정
// sixtysix-project.md 15.7 자동 검증 시나리오와 15.1 필수 화면 폭을 그대로 따른다.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 8901;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure'
  },
  // 디자인 규정 21.1 필수 화면 폭
  projects: [
    { name: '430', use: { ...devices['Desktop Chrome'], viewport: { width: 430, height: 932 }, isMobile: false } },
    { name: '390', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false } },
    { name: '360', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 780 }, isMobile: false } }
  ],
  webServer: {
    command: `python3 -m http.server ${PORT}`,
    cwd: '../sixtysix',
    port: PORT,
    reuseExistingServer: !process.env.CI
  }
});
