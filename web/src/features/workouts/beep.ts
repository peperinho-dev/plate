// The timer beep.
//
// Deliberately an <audio> element rather than WebAudio. On iOS, WebAudio
// is treated as an alert sound and is silenced by the hardware ring/
// silent switch — so for anyone who keeps that switch off (most people,
// most of the time) the timer was mute no matter what. Media playback
// goes through the media channel instead, which the switch doesn't touch.
//
// The tone is synthesised into a WAV at runtime rather than shipped as an
// asset: it's a few KB, it needs no fetch, and it can't go missing from
// the precache.

const SAMPLE_RATE = 22050;
const FREQUENCY = 880;
const DURATION_S = 0.18;
// Long enough to avoid a click at each end, short enough to stay a blip.
const FADE_S = 0.012;

function encodeWav(samples: Float32Array): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format: PCM
  view.setUint16(22, 1, true); // channels: mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  samples.forEach((v, i) => {
    const clamped = Math.max(-1, Math.min(1, v));
    view.setInt16(44 + i * 2, clamped * 0x7fff, true);
  });
  return new Blob([buffer], { type: "audio/wav" });
}

function buildBeepUrl(): string {
  const total = Math.floor(SAMPLE_RATE * DURATION_S);
  const fade = Math.floor(SAMPLE_RATE * FADE_S);
  const samples = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const envelope = Math.min(1, i / fade, (total - i) / fade);
    samples[i] = Math.sin((2 * Math.PI * FREQUENCY * i) / SAMPLE_RATE) * 0.35 * envelope;
  }
  return URL.createObjectURL(encodeWav(samples));
}

let el: HTMLAudioElement | null = null;

function element(): HTMLAudioElement {
  if (!el) {
    el = new Audio(buildBeepUrl());
    el.preload = "auto";
  }
  return el;
}

// Must be called from inside the tap that starts a timer: iOS only allows
// playback that traces back to a gesture, and the beeps that matter all
// fire later from timer callbacks.
export function unlockBeep() {
  const a = element();
  a.load();
  void a.play().catch(() => {});
}

export function playBeep() {
  const a = element();
  // Rewind rather than spawn a second element, so consecutive interval
  // changes can't stack into a chord.
  a.currentTime = 0;
  void a.play().catch(() => {});
}
