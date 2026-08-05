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
// TODO(offline): zxing-wasm fetches its .wasm binary from a CDN by
// default, so a cold scan would fail with no connection — which matters
// for an installed PWA. Fix by self-hosting the binary and pointing
// setZXingModuleOverrides({ locateFile }) at it, then precaching it in the
// service worker. Deferred until the PWA plugin is wired up, so both land
// together.
import { BarcodeDetector } from "barcode-detector/ponyfill";

// Formats used on European grocery packaging. EAN-13 covers most Spanish
// products; EAN-8 shows up on small items.
export const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf"] as const;

export interface ScanControls {
  stop: () => void;
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

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false
  });

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
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  // Throttled to ~10fps: WASM decoding every frame burns battery for no
  // real gain in hit rate.
  const SCAN_INTERVAL_MS = 100;

  const tick = async () => {
    if (stopped) return;
    try {
      if (video.readyState >= 2) {
        const found = await detector.detect(video);
        if (!stopped && found.length > 0 && found[0].rawValue) {
          onResult(found[0].rawValue);
          return; // caller decides whether to stop; don't keep firing
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

  return { stop };
}
