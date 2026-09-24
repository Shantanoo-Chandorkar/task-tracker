import { chromium } from 'playwright';

const API_PATHS = ['/api/spaces', '/api/lists', '/api/statuses', '/api/sublists'];

const targetUrl = process.argv[2];
if (!targetUrl) {
    console.error('Usage: node scripts/perf-realload.mjs <url> [--runs N]');
    process.exit(1);
}

const runsFlagIndex = process.argv.indexOf('--runs');
const runs = runsFlagIndex === -1 ? 1 : Number(process.argv[runsFlagIndex + 1]);
if (!Number.isInteger(runs) || runs < 1) {
    console.error('--runs must be a positive integer');
    process.exit(1);
}

/**
 * Loads a URL in a real Chromium instance and reads back navigation + API resource timings.
 *
 * @param {import("playwright").Page} page Playwright page to navigate.
 * @param {string} url URL to load.
 * @returns {Promise<{ttfb: number, domContentLoaded: number, apiDurations: Record<string, number>}>}
 *   TTFB/DCL in ms, and per-API-path duration in ms (0 if that path wasn't requested on this load).
 */
async function loadAndMeasure(page, url) {
    await page.goto(url, { waitUntil: 'networkidle' });

    return page.evaluate((apiPaths) => {
        const [nav] = performance.getEntriesByType('navigation');
        const resources = performance.getEntriesByType('resource');

        const apiDurations = {};
        for (const path of apiPaths) {
            const entry = resources.find((r) => r.name.includes(path));
            apiDurations[path] = entry ? Math.round(entry.duration) : 0;
        }

        return {
            ttfb: Math.round(nav.responseStart),
            domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
            apiDurations,
        };
    }, API_PATHS);
}

/**
 * Runs one cold-load + repeat-load cycle against a fresh browser context (fresh cache).
 *
 * @param {import("playwright").Browser} browser Shared browser instance.
 * @param {string} url URL to load.
 * @returns {Promise<{load1: object, load2: object}>} Metrics from `loadAndMeasure` for both loads.
 */
async function runOnce(browser, url) {
    const context = await browser.newContext();
    const page = await context.newPage();
    // 4G-ish throttle, matches the mobile preset used by the Lighthouse scripts.
    const client = await context.newCDPSession(page);
    await client.send('Network.emulateNetworkConditions', {
        offline: false,
        downloadThroughput: (10 * 1024 * 1024) / 8,
        uploadThroughput: (2 * 1024 * 1024) / 8,
        latency: 20,
    });

    const load1 = await loadAndMeasure(page, url);
    const load2 = await loadAndMeasure(page, url);
    await context.close();

    return { load1, load2 };
}

/**
 * Averages a metric across runs, rounded to the nearest ms.
 *
 * @param {object[]} loads Array of `loadAndMeasure` results (all load1s or all load2s).
 * @param {(load: object) => number} pick Extracts the metric value from one load result.
 * @returns {number} Rounded average.
 */
function average(loads, pick) {
    return Math.round(loads.reduce((sum, load) => sum + pick(load), 0) / loads.length);
}

const browser = await chromium.launch();
const results = [];
for (let i = 1; i <= runs; i++) {
    console.log(`Run ${i}/${runs}: ${targetUrl}`);
    results.push(await runOnce(browser, targetUrl));
}
await browser.close();

const load1s = results.map((r) => r.load1);
const load2s = results.map((r) => r.load2);

console.log(`\n--- Real-browser load comparison (${runs} run${runs > 1 ? 's' : ''}, averaged) ---`);
console.log(
    `TTFB:              load1 ${average(load1s, (l) => l.ttfb)}ms   load2 ${average(load2s, (l) => l.ttfb)}ms`,
);
console.log(
    `DOMContentLoaded:  load1 ${average(load1s, (l) => l.domContentLoaded)}ms   load2 ${average(load2s, (l) => l.domContentLoaded)}ms`,
);
for (const path of API_PATHS) {
    const avg1 = average(load1s, (l) => l.apiDurations[path]);
    const avg2 = average(load2s, (l) => l.apiDurations[path]);
    console.log(`${path.padEnd(18)} load1 ${avg1}ms   load2 ${avg2}ms`);
}
