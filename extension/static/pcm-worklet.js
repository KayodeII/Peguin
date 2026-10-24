// Batches the capture context's 128-sample blocks into 100 ms frames (16 kHz mono) for the voice detector.
class PcmFrames extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(1600);
    this.at = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.frame[this.at++] = ch[i];
      if (this.at === this.frame.length) {
        this.port.postMessage(this.frame);
        this.frame = new Float32Array(1600);
        this.at = 0;
      }
    }
    return true;
  }
}
registerProcessor("pcm-frames", PcmFrames);
