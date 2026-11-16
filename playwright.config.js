import { defineConfig } from '@playwright/test';

const LOOPBACK_BASE_URL = 'http://127.0.0.1:4173';

export default defineConfig({
    testDir: './tests/browser',
    testMatch: '**/*.spec.js',
    outputDir: 'test-results/playwright',
    fullyParallel: false,
    forbidOnly: Boolean(process.env.CI),
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    timeout: 30_000,
    globalTimeout: 5 * 60_000,
    expect: {
        timeout: 5_000,
        toHaveScreenshot: {
            animations: 'disabled',
            caret: 'hide',
            scale: 'css',
            threshold: 0,
            maxDiffPixels: 0,
        },
    },
    reporter: [['line']],
    use: {
        baseURL: LOOPBACK_BASE_URL,
        locale: 'en-US',
        timezoneId: 'UTC',
        colorScheme: 'light',
        reducedMotion: 'no-preference',
        deviceScaleFactor: 1,
        viewport: { width: 1024, height: 768 },
        serviceWorkers: 'block',
        proxy: {
            server: 'http://127.0.0.1:1',
            bypass: '127.0.0.1,localhost',
        },
        video: 'off',
        trace: 'off',
        screenshot: 'off',
    },
    webServer: {
        command: 'python3 -m http.server 4173 --bind 127.0.0.1',
        url: `${LOOPBACK_BASE_URL}/tests/browser/fixture.html`,
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
