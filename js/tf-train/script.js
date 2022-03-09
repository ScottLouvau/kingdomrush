import { TowerData } from './data.js';

const ModelPath = '../data/models/v2/towers.json';
//const ModelPath = '../data/models/v2-f16/model.json';
//const ModelPath = '../data/models/v2-u8/model.json';
const classNames = ['Arca', 'Arch', 'Arch2', 'Arch3', 'Arti', 'Arti2', 'Arti3', 'Barb', 'Barr', 'Barr2', 'Barr3', 'BigB', 'Holy', 'Mage', 'Mage2', 'Mage3', 'Map', 'Musk', 'None', 'Rang', 'Sorc', 'Tesl'];
const NUM_OUTPUT_CLASSES = 22;

const IMAGE_WIDTH = 80;
const IMAGE_HEIGHT = 80;
const IMAGE_CHANNELS = 3; // 1; 

const NUM_DATASET_ELEMENTS = 9449;
const NUM_TRAIN_ELEMENTS = 8750;
const NUM_TEST_ELEMENTS = NUM_DATASET_ELEMENTS - NUM_TRAIN_ELEMENTS;

const BATCH_SIZE = 256;
const EPOCH_COUNT = 10;

function getModel() {
    const model = tf.sequential();

    // In the first layer of our convolutional neural network we have
    // to specify the input shape. Then we specify some parameters for
    // the convolution operation that takes place in this layer.
    model.add(tf.layers.conv2d({
        inputShape: [IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNELS],
        kernelSize: 5,
        filters: 8,
        strides: 1,
        activation: 'relu',
        kernelInitializer: 'varianceScaling'
    }));

    // The MaxPooling layer acts as a sort of downsampling using max values
    // in a region instead of averaging.
    model.add(tf.layers.maxPooling2d({ poolSize: [2, 2], strides: [2, 2] }));

    // Repeat another conv2d + maxPooling stack.
    // Note that we have more filters in the convolution.
    model.add(tf.layers.conv2d({
        kernelSize: 5,
        filters: 16,
        strides: 1,
        activation: 'relu',
        kernelInitializer: 'varianceScaling'
    }));
    model.add(tf.layers.maxPooling2d({ poolSize: [2, 2], strides: [2, 2] }));

    // Now we flatten the output from the 2D filters into a 1D vector to prepare
    // it for input into our last layer. This is common practice when feeding
    // higher dimensional data to a final classification output layer.
    model.add(tf.layers.flatten());

    // Our last layer is a dense layer which has 10 output units, one for each
    // output class (i.e. 0, 1, 2, 3, 4, 5, 6, 7, 8, 9).
    model.add(tf.layers.dense({
        units: NUM_OUTPUT_CLASSES,
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
        const d = data.nextTrainBatch(NUM_TRAIN_ELEMENTS);
        return [
            d.xs.reshape([NUM_TRAIN_ELEMENTS, IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNELS]),
            d.labels
        ];
    });

    const [testXs, testYs] = tf.tidy(() => {
        const d = data.nextTestBatch(NUM_TEST_ELEMENTS);
        return [
            d.xs.reshape([NUM_TEST_ELEMENTS, IMAGE_WIDTH, IMAGE_HEIGHT, IMAGE_CHANNELS]),
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
        for (let j = 0; j < NUM_OUTPUT_CLASSES; ++j) {
            if (labels[i * NUM_OUTPUT_CLASSES + j] === 1) {
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

function doPrediction(model, data, testDataSize = 500) {
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
}

const data = new TowerData();

async function retrain() {
    const messageDiv = document.getElementById("message");
    messageDiv.innerText = "Retraining...";

    const model = getModel();
    tfvis.show.modelSummary({ name: 'Model Architecture', tab: 'Train' }, model);

    var start = performance.now();
    await train(model, data);
    var end = performance.now();

    var message = `Retraining done in ${((end - start) / 1000).toFixed(1)} sec.`;
    console.log(message);
    messageDiv.innerText = message;

    await model.save('downloads://towers');
}

async function predict() {
    const model = await tf.loadLayersModel(ModelPath);
    await showPredictionQuality(model, data);
}

async function run() {
    await data.load();
    await showExamples(data);

    //const model = getModel();
    const model = await tf.loadLayersModel(ModelPath);
    await showPredictionQuality(model, data);
}

document.addEventListener('DOMContentLoaded', run);
document.getElementById('retrain').addEventListener('click', retrain);
document.getElementById('predict').addEventListener('click', predict);