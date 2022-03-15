import fs from 'fs';
import canvas from 'canvas';

import { loadJson, saveAsPng, createCanvas } from './nodeBindings.mjs';
import SpriteWriter from '../common/spriteWriter.mjs';

const ffmpeg = "\\Users\\slouv\\OneDrive\\Tools\\bin\\ffmpeg\\ffmpeg.exe";
const pipGeo = {
    w: 17, h: 17,
    high: { relX: 0, relY: -17 },
    "2x": { n: "2x", relX: -78, relY: -118 },
    "2y": { n: "2y", relX: 62, relY: -118 },
    "3x": { n: "3x", relX: -95, relY: -99 },
    "3y": { n: "3y", relX: -8, relY: -144 },
    "3z": { n: "3z", relX: 79, relY: -99 },
    l2: { relX: 25, relY: 10 },
    l3: { relX: 25 + 9, relY: 10 + 24 }
};

// 17x17 is (-7, -7) relative to 4x4.
// L22 G1: (1332, 873)
// Sell (Low): (1322, 948)   => vPos: (-10, +75)
// X3 L1 4x4:  (1244, 781)   => vPos: (-88, -92); vSell: (-78, -167)
// X3 L1 17x17: (1237, 774)  => vPos: (-95, -99); vSell: (-85, -174)
// Y3 L1 17x17: (1324, 729)  => vPos: (-8, -144)
// Z3 L1 17x17: (1411, 774)  => vPos: (+79, -99)

// L9 E4: (1073, 625)
// [Rang, Low]
// X2 L1 17x17: (995, 507)   => vPos: (-78, -118)
// Y2 L1 17x17: (1135, 507)  => vPos: (62,  -118)

// Single Frame:
// child_process.execSync(`"${ffmpeg}" -ss ${item.at} -i "${inFilePath}" -vframes 1 -y "${stagingFilePath}"`);

function toRect(base, geo, off) {
    return {
        x: base.x + (geo?.relX ?? 0) + (off?.relX ?? 0),
        y: base.y + (geo?.relY ?? 0) + (off?.relY ?? 0),
        w: pipGeo.w,
        h: pipGeo.h
    };
}

async function extract(outBasePath) {
    const allPositions = await loadJson('../data/positions.min.json');
    const tests = await loadJson('test/abilityCircle.cases.json');

    await fs.promises.mkdir(outBasePath, { recursive: true });
    await fs.promises.mkdir(`${outBasePath}/blue`, { recursive: true });
    await fs.promises.mkdir(`${outBasePath}/black`, { recursive: true });
    await fs.promises.mkdir(`${outBasePath}/silver`, { recursive: true });
    await fs.promises.mkdir(`${outBasePath}/other`, { recursive: true });

    const can = createCanvas(pipGeo.w, pipGeo.h);
    const ctx = can.getContext('2d');

    for (let i = 0; i < tests.length; ++i) {
        const test = tests[i];
        const img = await canvas.loadImage(`test/img/png/abilityCircle/${test.file}.png`);
        const positions = allPositions[test.map];

        const set = expandToAll(test, positions);

        for (let j = 0; j < set.length; ++j) {
            const item = set[j];
            ctx.drawImage(img, item.x, item.y, pipGeo.w, pipGeo.h, 0, 0, pipGeo.w, pipGeo.h);
            await saveAsPng(`${outBasePath}/${item.color}/L${test.file}_${i}_${j}.png`, can);
        }

        console.log('.');
    }
}

function expandToAll(test, positions) {
    if (!test.on) { return []; }

    const circle = test.circle || test.cAlt;
    let baseR = positions[circle.posName];
    if (test.on[0] === 's' || test.on[0] === 't') {
        baseR = toRect(baseR, pipGeo.high);
    }

    let set = [];

    build(set, baseR, "2x", 1, test);
    build(set, baseR, "2x", 2, test);
    build(set, baseR, "2x", 3, test);

    build(set, baseR, "2y", 1, test);
    build(set, baseR, "2y", 2, test);
    build(set, baseR, "2y", 3, test);

    build(set, baseR, "3x", 1, test);
    build(set, baseR, "3x", 2, test);
    build(set, baseR, "3x", 3, test);

    build(set, baseR, "3y", 1, test);
    build(set, baseR, "3y", 2, test);
    build(set, baseR, "3y", 3, test);

    build(set, baseR, "3z", 1, test);
    build(set, baseR, "3z", 2, test);
    build(set, baseR, "3z", 3, test);

    return set;
}

function build(set, baseR, pipName, pipLevel, test) {
    const circle = test.circle ?? test.cAlt;
    const on = test.on;
    const upgrade = pipName[1];

    const level = circle[upgrade];

    // Barracks have three different abilities, other towers have two
    const abilityCount = (on[0] === 'p' ? 3 : 2);

    // Abilities have three levels except Holy Order Shields and Tesla Supercharged Bolt
    let maxLevel = 3;
    if (on === "p4" && upgrade === 'y') { maxLevel = 1; }
    if (on === "t5" && upgrade === 'x') { maxLevel = 2; }

    let color = test[pipName];
    if (!color) {
        if (parseInt(pipName[0]) !== abilityCount) {
            // If there aren't this number of abilities for this tower, it's other (hitting the background map)
            color = "other";
        } else if (pipLevel > maxLevel) {
            // If this ability doesn't have that many levels, it's silver (hitting the ring)
            color = "silver";
        } else if (level >= pipLevel) {
            // If this many levels are unlocked, pip should be blue
            color = "blue";
        } else {
            // Otherwise, pip is black
            color = "black";
        }
    }

    const rect = toRect(baseR, pipGeo[pipName], pipGeo["l" + pipLevel]);
    const result = { ...rect, color: color }
    set.push(result);
}

function timeToSeconds(time) {
    const parts = time.split(':');
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
}

async function toSingleSprite(collectionFolderPath, outPath) {
    await fs.promises.mkdir(outPath, { recursive: true });

    const writer = new SpriteWriter(
        pipGeo.w,
        pipGeo.h,
        20,
        20,
        outPath,
        canvas.createCanvas,
        saveAsPng
    );

    let counts = {};
    const states = await fs.promises.readdir(collectionFolderPath);

    for (let i = 0; i < states.length; ++i) {
        const state = states[i];
        const images = await fs.promises.readdir(`${collectionFolderPath}/${state}`);

        for (let j = 0; j < images.length; ++j) {
            const img = await canvas.loadImage(`${collectionFolderPath}/${state}/${images[j]}`);
            await writer.appendImage(img, 0, 0);
        }

        counts[state] = images.length;
        console.log('.');
    }

    await writer.nextCanvas();
    await fs.promises.writeFile(`${outPath}/counts.json`, JSON.stringify(counts), 'utf8');
}

async function main() {
    const start = performance.now();

    const outBasePath = `/Working/KR-Circle-Tensor`;
    const spritePath = `/Working/KR-Circle-Sprites`;

    await extract(outBasePath);
    await toSingleSprite(outBasePath, spritePath);

    const end = performance.now();
    console.log();
    console.log(`Done in ${((end - start) / 1000).toFixed(1)}s.`);
}

main();