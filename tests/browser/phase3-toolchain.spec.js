import { expect, isLoopbackRequest, test } from './roomabouts-test.js';

test('pinned Chromium launches the loopback-only synthetic fixture', async ({
    page,
    roomaboutsNetworkBoundary,
}) => {
    const externalRequests = [];
    page.on('request', (request) => {
        if (!isLoopbackRequest(request.url())) externalRequests.push(request.url());
    });

    await page.goto('/tests/browser/fixture.html');
    await expect(page).toHaveTitle('Roomabouts synthetic browser fixture');
    await expect(page.locator('#card-host radar-map-card')).toHaveCount(1);
    await expect(page.locator('#status')).toContainText('subscribers=1');
    expect(externalRequests).toEqual([]);
    expect(roomaboutsNetworkBoundary).toEqual([]);
});
