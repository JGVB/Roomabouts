import { normalizeSameOriginAssetUrl } from '../../custom_components/radar_map_manager/www/radar-ui.js';

const assertEquals = (actual, expected, message) => {
    if (actual !== expected) {
        throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
};

const HA_ORIGIN = 'https://home.example:8123';

Deno.test('same-origin asset URLs normalize to origin-relative paths', () => {
    const cases = [
        ['/local/floor plan.png', '/local/floor%20plan.png'],
        ['images/floor.png?revision=2#map', '/images/floor.png?revision=2#map'],
        ['https://home.example:8123/local/floor.png', '/local/floor.png'],
        ['//home.example:8123/local/floor.png', '/local/floor.png'],
    ];

    for (const [input, expected] of cases) {
        assertEquals(normalizeSameOriginAssetUrl(input, HA_ORIGIN), expected, input);
    }
});

Deno.test('asset URL normalization rejects external or unsafe schemes', () => {
    const rejected = [
        'https://other.example/floor.png',
        '//other.example/floor.png',
        'http://home.example:8123/floor.png',
        'data:image/png;base64,abc',
        'blob:https://home.example:8123/id',
        'javascript:alert(1)',
        'ftp://home.example:8123/floor.png',
    ];

    for (const input of rejected) {
        assertEquals(normalizeSameOriginAssetUrl(input, HA_ORIGIN), null, input);
    }
});

Deno.test('asset URL normalization rejects credentials and malformed input', () => {
    const rejected = [
        'https://user:secret@home.example:8123/floor.png',
        'http://[not-an-address',
        '',
        '   ',
        null,
        undefined,
        { path: '/local/floor.png' },
    ];

    for (const input of rejected) {
        assertEquals(normalizeSameOriginAssetUrl(input, HA_ORIGIN), null, String(input));
    }

    assertEquals(normalizeSameOriginAssetUrl('/local/floor.png', 'not an origin'), null, 'bad origin');
    assertEquals(
        normalizeSameOriginAssetUrl('/local/floor.png', 'https://user:secret@home.example:8123'),
        null,
        'credentialed origin',
    );
});
