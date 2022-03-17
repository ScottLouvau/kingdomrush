import { TowerData } from './data.js';

//const ModelPath = '../data/models/pips-v2/pips.json';
const ModelPath = '../data/models/pips-tiny/pips.json';
const classNames = ['black', 'blue', 'other'];

const IMAGE_WIDTH = 17;
const IMAGE_HEIGHT = 17;
const IMAGE_CHANNELS = 3; // 1;

const BATCH_SIZE = 8;
const EPOCH_COUNT = 10;

let model = null;

function getModel() {
    const model = tf.sequential();

    // In the first layer of our convolutional neural network we have
    // to specify the input shape. Then we specify some parameters for
    // the convolution operation that takes place in this layer.
    model.add(tf.layers.conv2d({
        inputShape: [IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNELS],
        kernelSize: 5,
        filters: 4,
        strides: 1,
        activation: 'relu',
        kernelInitializer: 'varianceScaling'
    }));

    // The MaxPooling layer acts as a sort of downsampling using max values
    // in a region instead of averaging.
    model.add(tf.layers.maxPooling2d({ poolSize: [2, 2], strides: [2, 2] }));

    // // Repeat another conv2d + maxPooling stack.
    // // Note that we have more filters in the convolution.
    // model.add(tf.layers.conv2d({
    //     kernelSize: 5,
    //     filters: 16,
    //     strides: 1,
    //     activation: 'relu',
    //     kernelInitializer: 'varianceScaling'
    // }));
    // model.add(tf.layers.maxPooling2d({ poolSize: [2, 2], strides: [2, 2] }));

    // Now we flatten the output from the 2D filters into a 1D vector to prepare
    // it for input into our last layer. This is common practice when feeding
    // higher dimensional data to a final classification output layer.
    model.add(tf.layers.flatten());

    // Our last layer is a dense layer which has 10 output units, one for each
    // output class (i.e. 0, 1, 2, 3, 4, 5, 6, 7, 8, 9).
    model.add(tf.layers.dense({
        units: classNames.length,
        kernelInitializer: 'varianceScaling',
        activation: 'softmax'
    }));


    // Choose an optimizer, loss function and accuracy metric,
    // then compile and return the model
    const optimizer = tf.train.adam();
    model.compile({
        optimizer: optimizer,
        loss: 'categoricalCrossentropy',
        metrics: ['accuracy'],
    });

    return model;
}

async function train(model, data) {
    const metrics = ['loss', 'val_loss', 'acc', 'val_acc'];
    const container = {
        name: 'Model Training', tab: 'Train', styles: { height: '1000px' }
    };
    const fitCallbacks = tfvis.show.fitCallbacks(container, metrics);

    const [trainXs, trainYs] = tf.tidy(() => {
        const d = data.nextTrainBatch(data.trainCount);
        return [
            d.xs.reshape([data.trainCount, IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNELS]),
            d.labels
        ];
    });

    const [testXs, testYs] = tf.tidy(() => {
        const d = data.nextTestBatch(data.testCount);
        return [
            d.xs.reshape([data.testCount, IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNELS]),
            d.labels
        ];
    });

    return model.fit(trainXs, trainYs, {
        batchSize: BATCH_SIZE,
        validationData: [testXs, testYs],
        epochs: EPOCH_COUNT,
        shuffle: true,
        callbacks: fitCallbacks
    });
}

async function showExamples(data) {
    // Create a container in the visor
    const surface =
        tfvis.visor().surface({ name: 'Input Data Examples', tab: 'Input Data' });

    // Get the examples
    const examples = data.nextTestBatch(20);
    const numExamples = examples.xs.shape[0];
    const labels = examples.labels.dataSync();

    // Create a canvas element to render each example
    for (let i = 0; i < numExamples; i++) {
        const imageTensor = tf.tidy(() => {
            return examples.xs
                .slice([i, 0], [1, examples.xs.shape[1]])
                .reshape([IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNELS]);
        });

        let imageClass = -1;
        for (let j = 0; j < classNames.length; ++j) {
            if (labels[i * classNames.length + j] === 1) {
                imageClass = j;
                break;
            }
        }

        const canvas = document.createElement('canvas');
        canvas.width = IMAGE_WIDTH;
        canvas.height = IMAGE_HEIGHT;
        canvas.style = 'margin: 4px;';
        canvas.title = (imageClass === -1 ? "Unknown" : classNames[imageClass]);

        await tf.browser.toPixels(imageTensor, canvas);
        surface.drawArea.appendChild(canvas);

        imageTensor.dispose();
    }
}

function doPrediction(model, data, testDataSize) {
    if (!testDataSize) { testDataSize = Math.floor(Math.min(250, data.testCount / 3)); }
    const testData = data.nextTestBatch(testDataSize);
    const testxs = testData.xs.reshape([testDataSize, IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNELS]);
    const labels = testData.labels.argMax(-1);
    const preds = model.predict(testxs).argMax(-1);

    testxs.dispose();
    return [preds, labels];
}


async function showPredictionQuality(model, data) {
    const [preds, labels] = doPrediction(model, data);

    const classAccuracy = await tfvis.metrics.perClassAccuracy(labels, preds);
    tfvis.show.perClassAccuracy({ name: 'Accuracy', tab: 'Evaluation' }, classAccuracy, classNames);

    const confusionMatrix = await tfvis.metrics.confusionMatrix(labels, preds);
    tfvis.render.confusionMatrix({ name: 'Confusion Matrix', tab: 'Evaluation' }, { values: confusionMatrix, tickLabels: classNames });

    labels.dispose();
    tfvis.visor().setActiveTab('Evaluation');
}

async function showModelDetails() {
    if (!model) { model = await tf.loadLayersModel(ModelPath); }
    tfvis.show.modelSummary({ name: 'Model Architecture', tab: 'Model' }, model);

    const layer = model.layers[0];
    tfvis.show.layer({ name: 'Layer Summary', tab: 'Model'}, layer);

    const weights = layer.getWeights(false);

    // 5x5x3 x8
    const array = await weights[0].array();
    //tfvis.render.heatmap({ name: 'Weights', tab: 'Model'}, weights[0]);

    // Create a container in the visor
    // const surface = tfvis.visor().surface({ name: 'Weights', tab: 'Model' });

    // const canvas = document.createElement('canvas');
    // canvas.width = IMAGE_WIDTH;
    // canvas.height = IMAGE_HEIGHT;
    // canvas.style = 'margin: 4px;';

    // await tf.browser.toPixels(weights, canvas);
    // surface.drawArea.appendChild(canvas);

    tfvis.visor().setActiveTab('Model');
}

const data = new TowerData();

async function retrain() {
    const messageDiv = document.getElementById("message");
    messageDiv.innerText = "Retraining...";

    model = getModel();
    tfvis.show.modelSummary({ name: 'Model Architecture', tab: 'Train' }, model);

    var start = performance.now();
    await train(model, data);
    var end = performance.now();

    var message = `Retraining done in ${((end - start) / 1000).toFixed(1)} sec.`;
    console.log(message);
    messageDiv.innerText = message;

    await model.save('downloads://pips');
}

async function predict() {
    if (!model) { model = await tf.loadLayersModel(ModelPath); }
    await showPredictionQuality(model, data);
}

async function run() {
    await data.load();
    await showExamples(data);
    await predict();
}

document.addEventListener('DOMContentLoaded', run);
document.getElementById('retrain').addEventListener('click', retrain);
document.getElementById('predict').addEventListener('click', predict);
document.getElementById('details').addEventListener('click', showModelDetails);