import {
  createDuplicateGuard,
  SUPPORTED_BARCODE_FORMATS,
} from "./lib/scanner-utils.js";

/**
 * Starts a browser camera scanner. CI covers pure scanner helpers and manual full-stack flow;
 * it does not validate ZXing camera integration or physical device cameras.
 * @param {HTMLVideoElement} video
 * @param {(barcode: string) => void} onBarcode
 */
export async function startBarcodeScanner(video, onBarcode) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("CAMERA_UNSUPPORTED");
  }

  const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] =
    await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
  const hints = new Map();
  hints.set(
    DecodeHintType.POSSIBLE_FORMATS,
    SUPPORTED_BARCODE_FORMATS.map((format) => BarcodeFormat[format]),
  );
  const reader = new BrowserMultiFormatOneDReader(hints, {
    delayBetweenScanAttempts: 80,
  });
  const isDuplicate = createDuplicateGuard();
  const controls = await reader.decodeFromConstraints(
    { audio: false, video: { facingMode: { ideal: "environment" } } },
    video,
    (/** @type {import('@zxing/library').Result | undefined} */ result) => {
      if (!result) return;
      const value = result.getText();
      if (!isDuplicate(value)) onBarcode(value);
    },
  );
  return () => controls.stop();
}
