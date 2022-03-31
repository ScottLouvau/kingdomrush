import allPositions from "../data/positions.min.mjs";
import towers from "../data/towers.min.mjs";
import settings from '../data/settings.mjs';

const towerNames = ['Arca', 'Arch', 'Arch2', 'Arch3', 'Arti', 'Arti2', 'Arti3', 'Barb', 'Barr', 'Barr2', 'Barr3', 'BigB', 'Holy', 'Mage', 'Mage2', 'Mage3', 'Map', 'Musk', 'None', 'Rang', 'Sorc', 'Tesl'];
const IMAGE_WIDTH = 80;
const IMAGE_HEIGHT = 80;
const IMAGE_CHANNELS = 3;

const ConfidenceThreshold = 0.95;
const SecondsPerFrame = 5;
const PlanEmptyLineAfterSeconds = 40;

const pipNames = ['black', 'blue', 'other'];
const pipGeo = {
    high: { relX: 0, relY: -17 },
    "2x": { n: "2x", relX: -78, relY: -118, w: 17, h: 17 },
    "2y": { n: "2y", relX: 62, relY: -118, w: 17, h: 17 },
    "3x": { n: "3x", relX: -95, relY: -99, w: 17, h: 17 },
    "3y": { n: "3y", relX: -8, relY: -144, w: 17, h: 17 },
    "3z": { n: "3z", relX: 79, relY: -99, w: 17, h: 17 },
    l1: { relX: 0, relY: 0 },
    l2: { relX: 25, relY: 10 },
    l3: { relX: 25 + 9, relY: 10 + 24 }
};

export default class Scanner {
    constructor(tf, towerModel, pipModel, diagnosticDrawing, logger) {
        this.tf = tf;
        this.towerModel = towerModel;
        this.pipModel = pipModel;
        this.diagnosticDrawing = diagnosticDrawing ?? null;
        this.logger = logger ?? null;
    }

    prewarm() {
        this.tf.tidy(() => {
            let shape = [...this.towerModel.inputs[0].shape];
            shape[0] = 1;
            this.towerModel.predict(this.tf.zeros(shape));

            shape = [...this.pipModel.inputs[0].shape];
            shape[0] = 1
            this.pipModel.predict(this.tf.zeros(shape));
        });

        this.log("Warmed up models.");
    }

    reset() {
        this.mapName = null;
    }

    init(ctx, mapName) {
        if (!mapName) {
            mapName = this.identifyMap(ctx);
            if (mapName === null) { return; }
        }

        this.log(mapName);
        this.mapName = mapName;
        this.positions = allPositions[mapName];
        this.plan = [mapName, ''];

        this.world = {};
        for (let posName in this.positions) {
            this.world[posName] = { base: { ln: 'None' } };
        }

        this.i = 0;
    }


    // Scan a series of PNG frames over time; write the build plan to console and output file
    async scanFrames(nextImage) {
        let ctx = await nextImage();
        this.init(ctx);

        for (; ctx !== null; ctx = await nextImage()) {
            this.nextFrame(ctx);
        }

        return this.plan.join('\r\n');
    }

    circleAtPosition(ctx) {
        const id = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (!this.positions) { return null; }

        // Look for ability circles at 2x1 and 3x1 high and low for every position
        const allPositionL1s = [];
        for (let posName in this.positions) {
            for (let high of [true, false]) {
                for (let abilityCount of [2, 3]) {
                    let r = this.toRect(this.positions[posName], pipGeo[`${abilityCount}x`]);
                    if (high) { r.y -= 17; }
                    allPositionL1s.push({ posName: posName, high: high, abilityCount: abilityCount, ...r });
                }
            }
        }

        const results = this.classify(id, allPositionL1s, this.pipModel, pipNames);//, true);
        let bestCircle = null;
        for (let circle of results) {
            if (circle.label !== "other" && circle.confidence >= 0.9 && circle.confidence > (bestCircle?.confidence ?? 0)) {
                bestCircle = {  ...circle, ...this.positions[circle.posName] };
                if (circle.high) bestCircle.y -= 17;
                break;
            }
        }

        return this.upgradeLevels(id, bestCircle);
    }

    upgradeLevels(id, firstCircle) {
        if (firstCircle === null) { return null; }
        let result = { posName: firstCircle.posName };

        // Look for ability circles for L1, L2, L3 for each ability present
        const pipLevels = [];
        for (let ability of (firstCircle.abilityCount === 3 ? ["3x", "3y", "3z"] : ["2x", "2y"])) {
            for (let level of [1, 2, 3]) {
                let r = this.toRect(firstCircle, pipGeo[ability]);
                r = this.toRect(r, pipGeo[`l${level}`]);
                pipLevels.push({ ability: ability, letter: ability[1], level: level, ...r });
            }
        }

        const results = this.classify(id, pipLevels, this.pipModel, pipNames);

        let i = 0;
        for (let ability of (firstCircle.abilityCount === 3 ? ["3x", "3y", "3z"] : ["2x", "2y"])) {
            let pips = [];
            let letter = results[i].letter;

            for (let level of [1, 2, 3]) {
                pips[level] = (results[i].confidence >= 0.9 ? results[i].label : "other");
                i++;
            }

            result[letter] = null;

            if (pips[3] === "blue") {
                if (pips[2] === "blue" && pips[1] === "blue") {
                    result[letter] = 3;
                }
            } else if (pips[2] === "blue") {
                if (pips[1] === "blue") {
                    result[letter] = 2;
                }
            } else if (pips[1] === "blue") {
                result[letter] = 1;
            } else if (pips[1] === "black") {
                result[letter] = 0;
            }
        }

        if (result?.x === null || result?.y === null || result?.z === null) { result = null; }
        return result;
    }

    toRect(position, geo) {
        return {
            x: position.x + (geo.relX ?? 0),
            y: position.y + (geo.relY ?? 0),
            w: position.w ?? geo.w,
            h: position.h ?? geo.h
        };
    }

    appendPixels(id, r, result) {
        const a8 = id.data;
        const array = result.array;
        let out = result.out ?? 0;

        let bottom = r.y + r.h;
        let right = r.x + r.w;
        let width = id.width;
        for (let y = r.y; y < bottom; ++y) {
            for (let x = r.x; x < right; ++x) {
                let j = 4 * (y * width + x);
                array[out++] = a8[j] / 255;
                array[out++] = a8[j + 1] / 255;
                array[out++] = a8[j + 2] / 255;
            }
        }

        result.out = out;
    }

    scanImage(ctx, positions, skipDiagnostics) {
        positions ??= this.positions;
        const id = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);

        // Get the profile rectangle pixels for each tower position on the map
        const allTowerProfiles = [];
        for (let posName in positions) {
            allTowerProfiles.push({ posName: posName, ...this.toRect(positions[posName], settings.geo.profile) });
        }

        const towerResults = this.classify(id, allTowerProfiles, this.towerModel, towerNames, skipDiagnostics);

        // Return the top predictions at each
        let state = {};
        for (let result of towerResults) {
            state[result.posName] = { best: { name: result.label, confidence: result.confidence }, ...positions[result.posName] };
        }

        return state;
    }

    identifyMap(ctx) {
        const start = performance.now();
        this.log("Identifying map...");

        let confidencePerMap = {};
        let positions = {};

        for (let mapName in allPositions) {
            const mapPositions = Object.values(allPositions[mapName]);
            for (let posIndex = 0; posIndex < 5; ++posIndex) {
                const pos = mapPositions[posIndex];
                if (!pos) { break; }
                positions[`${mapName}.${posIndex}`] = { ...pos, map: mapName };
            }
        }

        const state = this.scanImage(ctx, positions, true);
        for (let pName in state) {
            const match = state[pName];
            if (match.best.name !== 'Map') {
                confidencePerMap[match.map] = match.best.confidence + (confidencePerMap[match.map] ?? 0);                    
            }
        }

        let bestMap = null;
        for (let mapName in confidencePerMap) {
            if(bestMap === null || confidencePerMap[mapName] > confidencePerMap[bestMap]) {
                bestMap = mapName;
            }
        }

        const timeMs = performance.now() - start;
        if (bestMap && confidencePerMap[bestMap] >= ConfidenceThreshold) {
            this.log(`Map: ${bestMap} (${(confidencePerMap[bestMap] * 100 / 5).toFixed(0)}%) in ${timeMs.toFixed(0)}ms`);
            return bestMap;
        } else {
            this.log(`Map could not be identified after ${timeMs.toFixed(0)}ms. Will retry.`);
            return null;
        }
    }

    nextFrame(ctx) {
        if (!this.mapName) {
            this.init(ctx);
            if (!this.mapName) { return; }
        }

        let state = this.scanImage(ctx);
        this.state = state;
        let loggedThisFrame = false;

        for (let posName in state) {
            let matches = state[posName];
            const previous = this.world[posName]?.base?.ln;

            const evaluation = this.evaluateStep(posName, matches, previous);
            if (evaluation.issue === null && evaluation.isChange === false) {
                continue;
            }

            if (loggedThisFrame === false) {
                this.log();
                this.log(`${this.toTimeString(this.i * SecondsPerFrame)}`);
                loggedThisFrame = true;
            }

            if (evaluation.issue != null) {
                this.log(`  ${evaluation.issue}`);
            } else {
                this.logPositionState(posName, matches, previous);

                // Add new step to plan output
                const planStep = `${posName} ${matches.best.name}`;
                if (this.plan[this.plan.length - 1].startsWith(posName)) {
                    // Replace previous step if for same position
                    this.plan[this.plan.length - 1] = planStep;
                } else {
                    // Add log separator if enough time passed since last step
                    if (this.lastChangedFrame < this.i) {
                        if ((this.i - this.lastChangedFrame) >= (PlanEmptyLineAfterSeconds / SecondsPerFrame) && this.plan.length > 2) {
                            this.plan.push('');
                            this.plan.push(`# ${this.toTimeString(this.i * SecondsPerFrame)}`);
                        }
                    }

                    this.plan.push(planStep);
                }


                // Update world state
                this.world[posName].base = towers.base.find((t) => t.ln === matches.best.name);
                this.lastChangedFrame = this.i;
            }
        }

        this.i++;
        return state;
    }

    classify(id, rects, model, labels, skipDiagnostics) {
        if (!rects.length) { return []; }

        const rectCount = rects.length;
        const labelCount = labels.length;
        const width = rects[0].w;
        const height = rects[0].h;

        // Extract all requested rectangle pixels into a tensor
        const pixels = { array: new Float32Array(rectCount * width * height * 3), out: 0 };

        for (let i = 0; i < rectCount; ++i) {
            this.appendPixels(id, rects[i], pixels);
        }

        const inTensor = this.tf.tensor4d(pixels.array, [rectCount, width, height, 3]);

        // Classify each rectangle
        const outTensor = model.predict(inTensor);

        // Return each rectangle with a label and confidence level
        let results = [];
        const array = outTensor.dataSync();

        for (let i = 0; i < rectCount; ++i) {
            let label = null;
            let confidence = 0;

            for (let j = 0; j < labelCount; ++j) {
                const thisConfidence = array[j + i * labelCount];
                if (thisConfidence > confidence) {
                    confidence = thisConfidence;
                    label = labels[j];
                }
            }

            results[i] = { ...rects[i], label: label, confidence: confidence };
        }

        inTensor.dispose();
        outTensor.dispose();

        if (this.diagnosticDrawing && !skipDiagnostics) {
            this.drawDiagnostics(results);
        }

        return results;
    }

    drawDiagnostics(results) {
        for (let result of results) {
            if (!result.label) { continue; }
            if (result.confidence >= 0.95 && (result.label === "None" || result.label === "Map")) { continue; }

            if (result.w < 40) {
                this.diagnosticDrawing.drawBox(result, { borderColor: this.color(result) });
            } else {
                const color = this.color(result);
                const options = { left: true, fontSizePx: 18, textColor: color, backColor: '#222', borderColor: color };

                this.diagnosticDrawing.drawBox(result, { borderColor: color });
                this.diagnosticDrawing.drawText({ x: result.x, y: result.y + 17 }, result.label, options);
                this.diagnosticDrawing.drawText({ x: result.x, y: result.y + result.h }, `${(result.confidence * 100).toFixed(0)}`, options);
            }
        }
    }

    color(result) {
        if (result.confidence < 0.85) {
            // Red
            return "#f00";
        } else if (result.confidence < 0.95) {
            // Orange
            return "#f92";
        } else if (result.label === "blue") {
            // Teal
            return "#0ff";
        } else if (result.label === "black") {
            // Off-Black
            return "#222";
        } else if (result.label === "other") {
            // Brown
            return "#a74";
        } else {
            // Green
            return "#0f0";
        }
    }

    evaluateStep(posName, matches, previous) {
        if (matches?.best?.name === null) {
            return { issue: `ERROR ${posName}: returned no detections.` };
        } else if (matches.best.confidence < ConfidenceThreshold) {
            return { issue: `WARN ${posName}: ignored low confidence ${matches.best.name} (${(matches.best.confidence * 100).toFixed(0)}%)` };
        } else if (matches.best.name === "Map") {
            return { issue: `WARN ${posName}: detection said non-position map space.` };
        } else if (matches.best.name === "None") {
            if (previous !== "None") {
                return { issue: `WARN ${posName}: ignored None where previously ${previous}.` };
            }
        } else if (matches.best.name !== previous) {
            const prevTower = towers.base[previous];
            const currTower = towers.base[matches.best.name];

            if (prevTower) {
                if (currTower.shortName[0] !== prevTower.shortName[0]) {
                    return { issue: `ERROR ${posName}: Can't build ${matches.best.name} on ${previous}.` };
                } else if (currTower.shortName[1] < prevTower.shortName[1]) {
                    return { issue: `ERROR: ${posName}: Tower downgrade to ${matches.best.name} from ${previous}.` };
                }
            }

            return { issue: null, isChange: true };
        }

        return { issue: null, isChange: false };
    }

    logPositionState(posName, matches, previously) {
        let message = `  ${posName}: `;

        if (previously) {
            message += `${previously} => `;
        }

        message += matches.best.name;

        if (matches.best.confidence < 0.98) {
            message += `     [${(matches?.best?.confidence * 100).toFixed(0)}%]`;
        }

        this.log(message);
    }

    log(message) {
        if (!message) { message = ""; }

        if (this.logger) {
            this.logger(message);
        }
    }

    toTimeString(totalSeconds) {
        let hours = Math.floor(totalSeconds / 3600);
        let minutes = Math.floor((totalSeconds / 60)) % 60;
        let seconds = Math.floor(totalSeconds) % 60;
        let millis = Math.floor(totalSeconds * 1000) % 1000;

        if (totalSeconds > 0 && totalSeconds < 1) {
            return `${millis.toFixed(0)}ms`;
        }

        let result = `${minutes.toFixed(0).padStart(2, '0')}:${seconds.toFixed(0).padStart(2, '0')}`;

        if (hours > 0) {
            result = `${hours.toFixed(0).padStart(2, '0')}:${result}`;
        }

        if (millis !== 0 && totalSeconds < 10) {
            result += `.${millis.toFixed(0).padStart(3, '0')}`;
        }

        return result;
    }
}