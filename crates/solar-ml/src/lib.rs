//! ML/NPU placeholder.
//! v0.5 should wrap ONNX Runtime providers: CoreML, DirectML, Windows ML, OpenVINO, CUDA/TensorRT.

pub enum MlBackend {
    CpuOnnx,
    CoreMl,
    DirectMl,
    WindowsMl,
    OpenVino,
    CudaTensorRt,
}
