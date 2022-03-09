import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

import ImageProcessing from '../common/imageProcessing.mjs';
import Drawing from '../common/drawing.mjs';
import settings from '../data/settings.mjs';
import SpriteWriter from '../common/spriteWriter.mjs';
import { loadJson, createCanvas, loadImage, loadToCanvas, saveAsPng } from './nodeBindings.mjs';

const force = false;

async function findPositions() {
    if (!force && fs.existsSync(`../data/positions.min.mjs`)) { return; }
    console.log('Finding Map tower positions...');

    const manual = JSON.parse(await fs.promises.readFile('../../source-data/positions-manual.json', 'utf8'));
    const can = createCanvas(settings.maps.width, settings.maps.height);
    const ctx = can.getContext('2d');

    let allPositions = {};

    for (let i = 1; i <= settings.maps.count; ++i) {
        const mapName = `L${i}`;
        const img = await loadImage(`${settings.maps.originalsFolder}/${mapName}.png`);
        ctx.drawImage(img, 0, 0);
        const id = ctx.getImageData(0, 0, can.width, can.height);

        const matches = ImageProcessing.findColorRuns(id, settings.colors.beige);
        const positions = assignPositionNames(matches, manual[mapName]);

        allPositions[mapName] = positions;
        console.log(`${mapName}: ${Object.keys(positions).length}`);
    }

    await fs.promises.writeFile(`../data/positions.min.json`, JSON.stringify(allPositions), 'utf8');
    await fs.promises.writeFile(`../data/positions.json`, JSON.stringify(allPositions, null, 4), 'utf8');
    await fs.promises.writeFile(`../data/positions.min.mjs`, toMJS(JSON.stringify(allPositions)), 'utf8');
}

function assignPositionNames(found, manual) {
    // Merge found and manually specified positions and sort by Y ascending
    let matches = [...found, ...(manual ?? [])].sort((l, r) => l.y - r.y);

    // Find just-outside-range min and max for all position X and Y values
    const minX = Math.min(...matches.map((T) => T.x)) - 1;
    const maxX = Math.max(...matches.map((T) => T.x)) + 1;
    const minY = Math.min(...matches.map((T) => T.y)) - 1;
    const maxY = Math.max(...matches.map((T) => T.y)) + 1;

    // Assign boundaries for each distinct X letter (A-H) and Y digit (1-9)
    var xStep = Math.max(120, (maxX - minX) / 8);
    var yStep = Math.max(60, (maxY - minY) / 9);

    // Assign a letter+digit name to each position
    let positionsByName = {};
    for (var i = 0; i < matches.length; ++i) {
        const match = matches[i];

        const col = Math.floor((match.x - minX) / xStep);
        const row = Math.ceil((maxY - match.y) / yStep);

        var name = `${String.fromCharCode(65 + col)}${row}`;
        if (positionsByName[name] !== undefined) {
            console.log(`ERROR: Duplicate tower name for ${name}.`);
        }

        //match.name = name;
        positionsByName[name] = match;
    }

    return positionsByName;
}

async function generateMaps() {
    // Settled on large labelled maps only
    await labelAllMaps('large', 0.5);
    //await labelAllMaps('medium', 0.5);
    //await labelAllMaps('small', 0.5);

    // Settled on six column, quarter resolution map sprite
    await mapTiles(6, 0.25);
}

async function labelAllMaps(size, scale) {
    const outDir = `../../source-data/maps/labelled/${(size === 'large' ? '' : size)}`;
    if (!force && fs.existsSync(outDir)) { return; }

    console.log(`Generating ${size} labelled maps...`);
    await fs.promises.mkdir(outDir, { recursive: true });

    const allPositions = JSON.parse(await fs.promises.readFile('../data/positions.min.json', 'utf8'));
    const drawing = new Drawing(createCanvas(Math.floor(settings.maps.crop.w * scale), Math.floor(settings.maps.crop.h * scale)));

    for (let i = 1; i <= settings.maps.count; ++i) {
        const mapName = `L${i}`;
        await labelMap(allPositions, mapName, drawing.canvas, settings.labels[size], settings.maps.crop);
        await saveAsPng(`${outDir}/${mapName}.png`, drawing.canvas);
    }
}

async function labelMap(allPositions, mapName, toCanvas, label, crop) {
    crop ??= { x: 0, y: 0, w: toCanvas.width, h: toCanvas.height };
    const scale = (toCanvas.width / crop.w);

    // Scale label settings
    let labelA = { ...label };
    labelA.fontSizePx = Math.ceil(labelA.fontSizePx * scale);
    labelA.relX = Math.floor((labelA.relX ?? 0) * scale);
    labelA.relY = Math.floor((labelA.relY ?? 0) * scale);
    labelA.pad = Math.max(1, Math.ceil((labelA.pad ?? 0) * scale));

    // Draw scaled map
    const map = await loadImage(`${settings.maps.originalsFolder}/${mapName}.png`);
    const drawing = new Drawing(toCanvas);
    drawing.ctx.drawImage(map, crop.x, crop.y, crop.w, crop.h, 0, 0, toCanvas.width, toCanvas.height);

    // Mark positions with scaled coordinates and settings
    const positions = allPositions[mapName];
    for (let posName in positions) {
        const pos = positions[posName];
        const posA = {
            x: Math.floor((pos.x - crop.x) * (scale)),
            y: Math.floor((pos.y - crop.y) * (scale))
        };

        drawing.drawText(posA, posName, labelA);
    }
}

async function mapTiles(cols, scale) {
    const outDir = `../../source-data/sprites`;
    const outPath = `${outDir}/maps.png`
    if (!force && fs.existsSync(outPath)) { return; }

    console.log(`Generating tiled maps ${cols}c ${scale.toFixed(2)}x...`);
    await fs.promises.mkdir(`${outDir}/pending`, { recursive: true });

    const allPositions = JSON.parse(await fs.promises.readFile('../data/positions.min.json', 'utf8'));

    // Crop to remove top and bottom UX, preserve 16:9 aspect, and allow integer scaling (1/2, 1/4, 1/8)
    // UX on top 60px and bottom 90px.
    const crop = settings.maps.crop;
    const tile = { w: Math.floor(crop.w * scale), h: Math.floor(crop.h * scale) };

    const writer = new SpriteWriter(tile.w, tile.h, cols, Math.ceil(settings.maps.count / cols), `${outDir}/pending`, createCanvas, saveAsPng);
    const can = createCanvas(tile.w, tile.h);

    for (let i = 0; i < settings.maps.count; ++i) {
        await labelMap(allPositions, `L${settings.maps.tileOrder[i]}`, can, settings.labels.large, crop);
        writer.appendImage(can, 0, 0);
    }

    await writer.nextCanvas();
    await fs.promises.rename(`${outDir}/pending/1.png`, outPath);
    await fs.promises.rm(`${outDir}/pending`, { recursive: true });
}

async function extractAllTowers(outDir) {
    if (!force && fs.existsSync(`${outDir}/towers.png`)) { return; }

    console.log('Remastering tower sprites...');

    const canL = await extractTowerSet('L11');
    const ctxL = canL.getContext('2d');

    const canR = await extractTowerSet('L14');
    const ctxR = canR.getContext('2d');

    // Get pixels for both tower masters (with different blended background colors)
    var idL = ctxL.getImageData(0, 0, canL.width, canL.height);
    var idR = ctxR.getImageData(0, 0, canR.width, canR.height);

    // Set all "too different" pixels transparent
    ImageProcessing.clearWhereDifferent(idR, idL);

    // Reduce opacity of pixels adjacent to transparency
    ImageProcessing.blurEdges(idR);

    // Save final spritemap
    ctxR.putImageData(idR, 0, 0);
    await fs.promises.mkdir(outDir, { recursive: true });
    await saveAsPng(`${outDir}/towers.png`, canR);
}

async function extractTowerSet(level) {
    // Build output canvas for sprites
    const can = createCanvas(settings.geo.tower.w * 5, settings.geo.tower.h * 4);
    const ctx = can.getContext('2d');
    ctx.fillRect(0, 0, ctx.width, ctx.height, 'transparent');

    await extractTowers(ctx, `../../source-data/towers/${level}-P`);
    await extractTowers(ctx, `../../source-data/towers/${level}-R`);
    await extractTowers(ctx, `../../source-data/towers/${level}-S`);
    await extractTowers(ctx, `../../source-data/towers/${level}-T`);

    return can;
}

async function extractTowers(ctx, setName) {
    // Get build in composite [PlanParser can't be imported until positions.min.mjs is generated]
    const planText = await fs.promises.readFile(`../../source-data/towers/${setName}.txt`, 'utf8');
    const { default: PlanParser } = await import('../common/planParser.mjs');
    const plan = new PlanParser().parse(planText);

    // Get map background
    const canBack = await loadToCanvas(`${settings.maps.originalsFolder}/${plan.mapName}.png`);
    const ctxBack = canBack.getContext('2d');

    // Get map and towers composite
    const canMaster = await loadToCanvas(`../../source-data/towers/${setName}.png`);
    const ctxMaster = canMaster.getContext('2d');

    for (var i = 0; i < plan.steps.length; ++i) {
        var step = plan.steps[i];

        var r = {
            x: step.position.x + settings.geo.tower.relX,
            y: step.position.y + settings.geo.tower.relY,
            w: settings.geo.tower.w,
            h: settings.geo.tower.h,
        };

        // Get pixels for background and composite
        var bd = ctxBack.getImageData(r.x, r.y, r.w, r.h);
        var td = ctxMaster.getImageData(r.x, r.y, r.w, r.h);

        // Set all "same-as-background" pixels transparent
        ImageProcessing.clearWhereSame(td, bd);

        // Copy calculated pixels to spitemap
        ctx.putImageData(
            td,
            settings.geo.tower.w * (step.base.index % settings.geo.tower.cols),
            settings.geo.tower.h * Math.floor(step.base.index / settings.geo.tower.cols)
        );
    }
}

async function extractAllUpgrades(outDir) {
    if (!force && fs.existsSync(`${outDir}/upgrades.png`)) { return; }

    console.log('Remastering upgrade sprites...');

    // Build output canvas for sprites
    const can = createCanvas(settings.geo.upgradeLarge.w * 3, settings.geo.upgradeLarge.h * 8);
    const ctx = can.getContext('2d');
    ctx.fillRect(0, 0, ctx.width, ctx.height, 'transparent');

    await extractUpgrades(ctx, `Holy`, 0);
    await extractUpgrades(ctx, `Barb`, 1);
    await extractUpgrades(ctx, `Rang`, 2);
    await extractUpgrades(ctx, `Musk`, 3);
    await extractUpgrades(ctx, `Arca`, 4);
    await extractUpgrades(ctx, `Sorc`, 5);
    await extractUpgrades(ctx, `BigB`, 6);
    await extractUpgrades(ctx, `Tesl`, 7);
    await clearCorners(ctx);

    await fs.promises.mkdir(outDir, { recursive: true });
    await saveAsPng(`${outDir}/upgrades.png`, can, can.height / 2);
}

async function extractUpgrades(ctxO, towerName, towerRow) {
    // Get screenshot with upgrades
    const can = await loadToCanvas(`../../source-data/upgrades/${towerName}.png`);
    const ctx = can.getContext('2d');

    // All towers/upgrades are on L14 B4 at (742, 700).
    const r = settings.upgradeSourcePos;
    var imageData = ctx.getImageData(r.x, r.y, r.w, r.h);

    // Find all runs of near-black pixels (the price signs under upgrades)
    var positions = ImageProcessing.findColorRuns(imageData, settings.colors.black);

    // Extract rectangle with upgrade image and copy to spritesheet
    for (var i = 0; i < positions.length; ++i) {
        var cut = { x: positions[i].x, y: positions[i].y, w: settings.geo.upgradeLarge.w, h: settings.geo.upgradeLarge.h };
        var level = (positions.length === 3 ? [1, 0, 2][i] : i);

        ctxO.drawImage(can, r.x + cut.x, r.y + cut.y, cut.w, cut.h, level * cut.w, towerRow * cut.h, cut.w, cut.h);
    }
}

async function clearCorners(ctx) {
    // For each upgrade circle...
    for (var row = 0; row < 8; ++row) {
        for (var col = 0; col < 3; ++col) {
            // Get the circle pixels
            var base = { x: col * settings.geo.upgradeLarge.w, y: row * settings.geo.upgradeLarge.h, w: settings.geo.upgradeLarge.w, h: settings.geo.upgradeLarge.h };
            var imageData = ctx.getImageData(base.x, base.y, base.w, base.h);

            // Clear outside the circle
            ImageProcessing.clearOutsideCircle(imageData);

            ctx.putImageData(imageData, base.x, base.y);
        }
    }
}

async function emitShortPlans(plansFolderPath, outFilePath) {
    if (!force && fs.existsSync(outFilePath)) { return; }

    console.log(`Parsing and shortening plans under '${plansFolderPath}' into ${outFilePath}...`);
    const planFileNames = await fs.promises.readdir(plansFolderPath);

    const manualPath = `${plansFolderPath}/manual`;
    let manualPlanNames = [];
    if (fs.existsSync(manualPath)) {
        manualPlanNames = await fs.promises.readdir(`${plansFolderPath}/manual`);
    }

    const { default: PlanParser } = await import('../common/planParser.mjs');
    const parser = new PlanParser();

    let set = {};

    for (const planFileName of planFileNames) {
        const parsed = path.parse(planFileName);
        if (parsed.ext.toLowerCase() !== ".txt") { continue; }

        // Override plans with manual versions, if found
        let planPath = `${plansFolderPath}/${planFileName}`;
        if (manualPlanNames.find((n) => n.toLowerCase() === planFileName.toLowerCase())) {
            planPath = `${manualPath}/${planFileName}`
        }

        const planText = await fs.promises.readFile(planPath, 'utf8');
        const plan = parser.parse(planText);
        const shortForm = parser.toShortText(plan);

        set[parsed.name] = shortForm;

        // Double-check parse of short form is ok
        try {
            parser.parseShort(shortForm);
        } catch (error) {
            console.log(`${parsed.name} round-trip error: ${error}`);
            console.log(`${parsed.name}: ${shortForm}`);
        }
    }

    const outParsed = path.parse(outFilePath);
    const json = JSON.stringify(set, null, 4);
    await fs.promises.writeFile(`${outParsed.dir}/${outParsed.name}.json`, json, 'utf8');
    await fs.promises.writeFile(outFilePath, toMJS(json), 'utf8');
}

function toMJS(json) {
    let mjs = json;

    // Remove attribute names where not needed (name is valid non-numeric identifier)
    mjs = mjs.replace(/"([A-Za-z_$][A-Za-z0-9_$]*)":/g, "$1:");

    // Wrap in "export default"
    mjs = "export default " + mjs;
    return mjs;
}

async function main() {
    const start = performance.now();

    await findPositions();
    await extractAllTowers(`../../source-data/sprites`);
    await extractAllUpgrades(`../../source-data/sprites`);
    await generateMaps();
    await emitShortPlans(`../../source-data/plans`, `../data/plans.mjs`);

    const end = performance.now();
    console.log();
    console.log(`Done in ${((end - start) / 1000).toFixed(1)}s.`);
}

main();