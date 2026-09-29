// マイク音声を 16kHz / 16bit PCM に落として、100msごとにメインスレッドへ渡す
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.acc = [];
    this.pos = 0;
    this.buf = new Int16Array(1600); // 100ms @16kHz
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) this.acc.push(ch[i]);
    // 線形補間でダウンサンプル
    while (this.pos + 1 < this.acc.length) {
      const i = Math.floor(this.pos), f = this.pos - i;
      const s = this.acc[i] * (1 - f) + this.acc[i + 1] * f;
      this.buf[this.n++] = Math.max(-1, Math.min(1, s)) * 0x7fff;
      this.pos += this.ratio;
      if (this.n === this.buf.length) {
        this.port.postMessage(this.buf.buffer.slice(0));
        this.n = 0;
      }
    }
    const drop = Math.floor(this.pos);
    this.acc.splice(0, drop);
    this.pos -= drop;
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
