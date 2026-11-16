import { expect, test as base } from '@playwright/test';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

export const isLoopbackRequest = (requestUrl) => {
    try {
        const url = new URL(requestUrl);
        return url.protocol === 'data:'
            || (LOOPBACK_HOSTS.has(url.hostname)
                && (url.protocol === 'http:' || url.protocol === 'https:'));
    } catch {
        return false;
    }
};

export const test = base.extend({
    roomaboutsNetworkBoundary: [async ({ context }, use) => {
        const attemptedExternalRequests = [];
        await context.route('**/*', async (route) => {
            const requestUrl = route.request().url();
            if (isLoopbackRequest(requestUrl)) {
                await route.continue();
                return;
            }

            const url = new URL(requestUrl);
            attemptedExternalRequests.push({
                hostname: url.hostname,
                port: url.port,
                protocol: url.protocol,
            });
            await route.abort('blockedbyclient');
        });

        await use(attemptedExternalRequests);
        expect(attemptedExternalRequests).toEqual([]);
    }, { auto: true }],
});

export { expect };
