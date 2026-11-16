import { expect, test as base } from '@playwright/test';

const FIXTURE_ORIGIN = 'http://127.0.0.1:4173';
export const FIXTURE_FAVICON_DATA_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='13' fill='%236b4f2a'/%3E%3C/svg%3E";
const ALLOWED_PATH_PREFIXES = Object.freeze([
    '/custom_components/radar_map_manager/www/',
    '/tests/browser/',
]);

export const isLoopbackRequest = (requestUrl) => {
    if (requestUrl === FIXTURE_FAVICON_DATA_URL) return true;
    if (typeof requestUrl !== 'string'
        || !requestUrl.startsWith(`${FIXTURE_ORIGIN}/`)
        || requestUrl.includes('\\')
        || requestUrl.includes('\0')) return false;
    try {
        const url = new URL(requestUrl);
        if (url.origin !== FIXTURE_ORIGIN || url.username !== '' || url.password !== '') return false;

        const schemeEnd = requestUrl.indexOf('://');
        const rawPathStart = requestUrl.indexOf('/', schemeEnd + 3);
        if (schemeEnd < 0 || rawPathStart < 0) return false;
        const rawPathEndCandidates = [requestUrl.indexOf('?', rawPathStart), requestUrl.indexOf('#', rawPathStart)]
            .filter((index) => index >= 0);
        const rawPathEnd = rawPathEndCandidates.length ? Math.min(...rawPathEndCandidates) : requestUrl.length;
        const rawPath = requestUrl.slice(rawPathStart, rawPathEnd);
        let decodedPath;
        try {
            decodedPath = decodeURIComponent(rawPath);
        } catch {
            return false;
        }
        if (rawPath !== decodedPath
            || decodedPath.includes('\\')
            || decodedPath.includes('\0')
            || decodedPath.includes('//')) return false;

        const normalizedSegments = [];
        for (const segment of decodedPath.split('/')) {
            if (segment === '') continue;
            if (segment === '.' || segment === '..') return false;
            normalizedSegments.push(segment);
        }
        let normalizedPath = `/${normalizedSegments.join('/')}`;
        if (decodedPath.endsWith('/')) normalizedPath += '/';
        return ALLOWED_PATH_PREFIXES.some((prefix) => decodedPath.startsWith(prefix))
            && normalizedPath === decodedPath;
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
                event: 'external-request',
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
