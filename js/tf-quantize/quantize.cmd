:: Beforehand:
::  - Install Python 3.10 (amd64)
::  - 'pip3 install tensorflowjs'

:: https://www.tensorflow.org/lite/performance/model_optimization
:: Also investigate pruning; in 'Tensorflow Model Optimization Toolkit', only for Python as of Jan 2022.

:: https://github.com/tensorflow/tfjs/tree/master/tfjs-converter
::  Formats:
::    tfjs_layers_model
::    tfjs_graph_model
::    tf_frozen_model

:: --quantize_float16 *
:: --quantize_uint8 *


tensorflowjs_converter --input_format tfjs_layers_model --output_format tfjs_layers_model --quantize_float16 * "../data/models/v2/towers.json" "../data/models/v2-f16"

tensorflowjs_converter --input_format tfjs_layers_model --output_format tfjs_layers_model --quantize_uint8 * "../data/models/v2/towers.json" "../data/models/v2-u8"

tensorflowjs_converter --input_format tfjs_layers_model --output_format tfjs_graph_model --quantize_uint8 * "../data/models/v2/towers.json" "../data/models/v2-u8-graph"
