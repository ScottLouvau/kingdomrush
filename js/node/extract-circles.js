import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import canvas from 'canvas';

import settings from '../data/settings.mjs';
import { loadJson, saveAsPng } from './nodeBindings.mjs';
import SpriteWriter from '../common/spriteWriter.mjs';

const ffmpeg = "\\Users\\slouv\\OneDrive\\Tools\\bin\\ffmpeg\\ffmpeg.exe";
const pipGeo = {
    w: 17, h: 17,
    high: { relX: 0, relY: -17 },
    x2: { n: "x2", relX: -78, relY: -118 },
    y2: { n: "y2", relX: 62, relY: -118 },
    x3: { n: "x3", relX: -95, relY: -99 },
    y3: { n: "y3", relX: -8, relY: -144 },
    z3: { n: "z3", relX: 79, relY: -99 },
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

function toRect(base, geo) {
    return {
        x: base.x + (geo?.relX ?? 0),
        y: base.y + (geo?.relY ?? 0),
        w: pipGeo.w,
        h: pipGeo.h
    };
}

async function extract(extractPlanPath, inBasePath, outBasePath) {
    const allPositions = await loadJson('../data/positions.min.json');
    const circleFiles = await fs.promises.readdir(extractPlanPath);

    await fs.promises.mkdir(outBasePath, { recursive: true });
    await fs.promises.mkdir(`${outBasePath}/blue`, { recursive: true });
    await fs.promises.mkdir(`${outBasePath}/black`, { recursive: true });
    await fs.promises.mkdir(`${outBasePath}/silver`, { recursive: true });
    await fs.promises.mkdir(`${outBasePath}/other`, { recursive: true });

    for (let j = 0; j < circleFiles.length; ++j) {
        const extract = await loadJson(`${extractPlanPath}/${circleFiles[j]}`);
        const positions = allPositions[extract.map];
        const inFilePath = `${inBasePath}/${extract.name}.mp4`;

        for (let i = 0; i < extract.circles.length; ++i) {
            let item = extract.circles[i];
            let position = positions[item.pos];
            let r = position;
            if (item.hi === true) {
                r = toRect(r, pipGeo.high);
            }

            if (item.on[0] === 'p') {
                rip(item.at, inFilePath, toRect(r, pipGeo.x3), outBasePath, `${i}_${extract.name}_${item.pos}_x3`, item.x, 3);
                rip(item.at, inFilePath, toRect(r, pipGeo.y3), outBasePath, `${i}_${extract.name}_${item.pos}_y3`, item.y, (item.on === "p4" ? 1 : 3));
                rip(item.at, inFilePath, toRect(r, pipGeo.z3), outBasePath, `${i}_${extract.name}_${item.pos}_z3`, item.z, 3);
            } else {
                rip(item.at, inFilePath, toRect(r, pipGeo.x2), outBasePath, `${i}_${extract.name}_${item.pos}_x2`, item.x, (item.on === "t5" ? 2 : 3));
                rip(item.at, inFilePath, toRect(r, pipGeo.y2), outBasePath, `${i}_${extract.name}_${item.pos}_y2`, item.y, 3);
            }

            if (i % 5 === 0) { console.log('.'); }
            break;
        }
    }
}


function rip(time, inFilePath, baseR, outBasePath, outName, atLevel, maxLevel) {   
    // TODO: Timings not right; off by 2.0 sec?
    // TODO: Can't get 17x17 crop via FFMPEG. It writes 16x16. Extract whole frame and then cut out pips.
    // Should I move training data extraction to test.js?
    let r = baseR;
    let level = 1;
    let set = (maxLevel < level ? "silver" : (atLevel < level ? "black" : "blue"));
    child_process.execSync(`"${ffmpeg}" -ss ${time} -i "${inFilePath}" -t 0.01 -vf "crop=${pipGeo.w}:${pipGeo.h}:${r.x}:${r.y}" -f image2 -y "${outBasePath}/${set}/${outName}_L${level}.png"`);

    r = toRect(baseR, pipGeo.l2);
    level = 2;
    set = (maxLevel < level ? "silver" : (atLevel < level ? "black" : "blue"));
    child_process.execSync(`"${ffmpeg}" -ss ${time} -i "${inFilePath}" -t 0.01 -vf "crop=${pipGeo.w}:${pipGeo.h}:${r.x}:${r.y}" -f image2 -y "${outBasePath}/${set}/${outName}_L${level}.png"`);

    r = toRect(baseR, pipGeo.l3);
    level = 3;
    set = (maxLevel < level ? "silver" : (atLevel < level ? "black" : "blue"));
    child_process.execSync(`"${ffmpeg}" -ss ${time} -i "${inFilePath}" -t 0.01 -vf "crop=${pipGeo.w}:${pipGeo.h}:${r.x}:${r.y}" -f image2 -y "${outBasePath}/${set}/${outName}_L${level}.png"`);
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
    const args = process.argv.slice(2);

    const inBasePath = `/Working/KingdomRush/Play2/Out`;
    const outBasePath = `/Working/KR-Circle-Tensor`;
    const spritePath = `/Working/KR-Circle-Sprites`;

    const planPath = args[0] ?? '../../source-data/extract/circles';
    await extract(planPath, inBasePath, outBasePath);
    await toSingleSprite(outBasePath, spritePath);

    const end = performance.now();
    console.log();
    console.log(`Done in ${((end - start) / 1000).toFixed(1)}s.`);
}

main();