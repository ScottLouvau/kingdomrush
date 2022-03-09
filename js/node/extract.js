import fs from 'fs';
import path from 'path';
import child_process from 'child_process';
import canvas from 'canvas';

import settings from '../data/settings.mjs';
import { loadJson, saveAsPng } from './nodeBindings.mjs';
import SpriteWriter from '../common/spriteWriter.mjs';

const ffmpeg = "\\Users\\slouv\\OneDrive\\Tools\\bin\\ffmpeg\\ffmpeg.exe";

async function extract(extractPlanPath, inBasePath, outBasePath) {
    const allPositions = await loadJson('../data/positions.min.json');
    const extract = await loadJson(extractPlanPath);

    for (var i = 0; i < extract.series.length; ++i) {
        var item = extract.series[i];
        var inFilePath = `${inBasePath}/${item.in}`;
        var outPath = `${outBasePath}/${item.tower}`;
        var outNameBase = `S${i}_${path.parse(item.in).name}_${item.pos}`;

        var position = allPositions[item.map][item.pos];
        var r = {
            x: position.x + settings.geo.profile.relX,
            y: position.y + settings.geo.profile.relY
        };

        if (!fs.existsSync(`${outPath}/${outNameBase}_F01.png`)) {
            await fs.promises.mkdir(outPath, { recursive: true });
            child_process.execSync(`"${ffmpeg}" -ss ${item.from} -i "${inFilePath}" -t ${item.for ?? "9.2"} -vf "crop=80:80:${r.x}:${r.y}, fps=2.73" -vsync vfr -f image2 -y "${outPath}/${outNameBase}_F%02d.png"`);
        }

        if (i % 5 === 0) { console.log('.'); }
    }
}

async function toSingleSprite(collectionFolderPath, outPath) {
    await fs.promises.mkdir(outPath, { recursive: true });

    const writer = new SpriteWriter(
        settings.geo.profile.w,
        settings.geo.profile.h,
        100,
        100,
        outPath,
        canvas.createCanvas,
        saveAsPng
    );

    let towerCounts = {};
    const towers = await fs.promises.readdir(collectionFolderPath);

    for (var i = 0; i < towers.length; ++i) {
        const tower = towers[i];
        const towerFiles = await fs.promises.readdir(`${collectionFolderPath}/${tower}`);

        for (var j = 0; j < towerFiles.length; ++j) {
            const img = await canvas.loadImage(`${collectionFolderPath}/${tower}/${towerFiles[j]}`);
            await writer.appendImage(img, 0, 0);
        }

        towerCounts[tower] = towerFiles.length;
        console.log('.');
    }

    await writer.nextCanvas();
    await fs.promises.writeFile(`${outPath}/counts.json`, JSON.stringify(towerCounts), 'utf8');
}

async function main() {
    const start = performance.now();
    const args = process.argv.slice(2);

    const inBasePath = `/Working/KingdomRush/Play2/Out`;
    const outBasePath = `/Working/KR-Tensor`;
    const spritePath = `/Working/KR-Tensor-Sprites`;

    const planPath = args[0] ?? '../../source-data/extract/extract.json';
    await extract(planPath, inBasePath, outBasePath);
    await toSingleSprite(outBasePath, spritePath);

    const end = performance.now();
    console.log();
    console.log(`Done in ${((end - start) / 1000).toFixed(1)}s.`);

    
}

main();