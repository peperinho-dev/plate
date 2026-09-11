// Camera barcode scanning.
//
// Upgrade over the vanilla app, which used the native BarcodeDetector when
// present and lazily CDN-loaded @zxing/browser (the pure-JS ZXing port) as
// a fallback. That fallback is the slow, miss-prone path — and it's the
// path iOS Safari always took, since Safari still ships no native
// BarcodeDetector.
//
// The `barcode-detector` ponyfill exposes the same standard API but is
// backed by ZXing-C++ compiled to WebAssembly, which is dramatically more
// reliable on exactly the hard cases (small/curved/low-contrast EAN-13 on
// supermarket packaging). Using the ponyfill export means one code path on
// every browser, rather than two that behave differently.
import { BarcodeDetector, setZXingModuleOverrides } from "barcode-detector/ponyfill";
// ?url makes Vite emit the binary as a hashed asset in dist/ and hand back
// its final URL — so it ships from our own origin instead of zxing-wasm's
// default CDN. That's what lets the service worker precache it and keeps
// scanning working offline in the installed PWA.
import zxingWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

// Must be set before the first detector is constructed.
setZXingModuleOverrides({ locateFile: () => zxingWasmUrl });

// Formats used on European grocery packaging. EAN-13 covers most Spanish
// products; EAN-8 shows up on small items.
export const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] as const;

export interface ScanControls {
  stop: () => void;
  /** Turns the rear light on or off; null when the device has none. */
  setTorch: ((on: boolean) => Promise<void>) | null;
}

export interface StartScanOptions {
  video: HTMLVideoElement;
  onResult: (barcode: string) => void;
  onError?: (err: unknown) => void;
}

// Requests the rear camera, streams it into `video`, and polls frames for
// a barcode. Returns controls whose stop() tears down both the polling
// loop and the camera track — callers must invoke it, or the camera light
// stays on after the modal closes.
export async function startScan({ video, onResult, onError }: StartScanOptions): Promise<ScanControls> {
  const detector = new BarcodeDetector({ formats: [...BARCODE_FORMATS] });

  // Resolution is the whole ballgame. Asking only for the rear camera
  // lets the browser pick, and browsers pick 640x480 — at which an EAN-13
  // printed 25mm wide across a curved packet is a handful of pixels per
  // bar and simply does not decode. Asking for 1080p is honoured on every
  // phone made in the last decade, and `ideal` means a device that can't
  // manage it still gets a camera rather than an error.
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  });

  // Continuous autofocus, where the browser exposes it. Chrome on Android
  // otherwise locks focus at whatever it had when the stream opened, which
  // is the difference between reading a barcode held 10cm away and never
  // reading it at all. Unsupported keys throw rather than being ignored,
  // so this is attempted separately and allowed to fail.
  const [track] = stream.getVideoTracks();
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet]
    });
  } catch {
    // iOS focuses continuously on its own and rejects the constraint.
  }

  // Torch, for the inside of a supermarket aisle. Reported per device, so
  // the button can be hidden entirely when there is nothing to toggle.
  const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined;
  const setTorch = capabilities?.torch
    ? async (on: boolean) => {
        await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      }
    : null;

  video.srcObject = stream;
  video.setAttribute("playsinline", "true"); // iOS refuses inline playback without this
  await video.play();

  let stopped = false;
  let rafId = 0;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(rafId);
    clearTimeout(timeoutId);
    // Torch off before the track dies, or some Android devices leave the
    // light on until the camera is next opened.
    if (setTorch) void setTorch(false).catch(() => {});
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  // Throttled to ~10fps: WASM decoding every frame burns battery for no
  // real gain in hit rate.
  const SCAN_INTERVAL_MS = 100;

  // The same value has to come back twice before it is believed. EAN-13
  // carries a check digit, so a misread is unlikely rather than
  // impossible — and the cost of the second frame is 100ms, against a
  // wrong product silently logged.
  let lastValue: string | null = null;

  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        const found = await detector.detect(video);
        const value = found[0]?.rawValue;
        if (!stopped && value) {
          if (value === lastValue) {
            onResult(value);
            return; // caller decides whether to stop; don't keep firing
          }
          lastValue = value;
        }
      }
    } catch (err) {
      // A single bad frame shouldn't kill the session — keep scanning and
      // only surface persistent failures.
      onError?.(err);
    }
    if (!stopped) {
      timeoutId = setTimeout(() => {
        rafId = requestAnimationFrame(tick);
      }, SCAN_INTERVAL_MS);
    }
  };

  rafId = requestAnimationFrame(tick);

  return { stop, setTorch };
}
