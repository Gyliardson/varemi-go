import { createDuplicateGuard } from './lib/scanner-utils.js';

/**
 * Starts a browser camera scanner. This integration is exercised with mocked browser boundaries in CI;
 * it is not evidence that physical device cameras were validated.
 * @param {HTMLVideoElement} video
 * @param {(barcode: string) => void} onBarcode
 */
export async function startBarcodeScanner(video, onBarcode) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('CAMERA_UNSUPPORTED');
  }

  const [{ BrowserMultiFormatOneDReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
  ]);
  const reader = new BrowserMultiFormatOneDReader(hints, { delayBetweenScanAttempts: 80 });
  const isDuplicate = createDuplicateGuard();
  const controls = await reader.decodeFromConstraints(
    { audio: false, video: { facingMode: { ideal: 'environment' } } },
    video,
    (/** @type {import('@zxing/library').Result | undefined} */ result) => {
      if (!result) return;
      const value = result.getText();
      if (!isDuplicate(value)) onBarcode(value);
    },
  );
  return () => controls.stop();
}
