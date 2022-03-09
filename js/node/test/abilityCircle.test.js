import fs from 'fs';
import { jest } from '@jest/globals';
import { createCanvas, loadToContext } from '../nodeBindings.mjs';
import Scanner from "../../common/scanner.mjs";

const scanner = new Scanner(null, null, null);
const cases = JSON.parse(await fs.promises.readFile('test/abilityCircle.cases.json', 'utf8'));


test("Ability Circles L5", async () => {
    await runCases("L5");
});

test("Ability Circles L9", async () => {
    await runCases("L9");
});

test("Ability Circles L16", async () => {
    await runCases("L16");
});

test("Ability Circles L22", async () => {
    await runCases("L22");
});

test("Ability Circle Performance", async () => {
    const can = createCanvas(1920, 1080);
    const ctx = can.getContext('2d');

    const test = cases[0];
    await loadToContext(`test/img/WebP/abilityCircle/${test.file}.webp`, ctx);
    await scanner.init(ctx, test.map);

    const iterations = 25;
    const start = performance.now();
    let circle = null;
    for (let i = 0; i < iterations; ++i) {
        circle = scanner.circleAtPosition(ctx);
    }
    const end = performance.now();
    expect(circle).toEqual(test.circle);

    // Target 4 fps at 16x speed under 50% CPU. (64 scans/sec is 15.6 ms/eal 7.5 ms is 50%)
    expect(end - start).toBeLessThan(7.5 * iterations);
});

async function runCases(mapName) {
    const can = createCanvas(1920, 1080);
    const ctx = can.getContext('2d');

    for (const test of cases.filter((c) => c.map === mapName)) {
        await loadToContext(`test/img/WebP/abilityCircle/${test.file}.webp`, ctx);
        await scanner.init(ctx, test.map);
        const circle = scanner.circleAtPosition(ctx);
        expect(circle).toEqual(test.circle);
    }
}
