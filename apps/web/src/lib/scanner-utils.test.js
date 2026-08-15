import { describe, expect, it } from "vitest";
import {
  cameraErrorMessage,
  createDuplicateGuard,
  SUPPORTED_BARCODE_FORMATS,
} from "./scanner-utils.js";

describe("scanner fallbacks", () => {
  it("explains denied camera permission", () => {
    expect(cameraErrorMessage(new DOMException("", "NotAllowedError"))).toMatch(
      /negada/,
    );
  });

  it("explains unavailable camera", () => {
    expect(cameraErrorMessage(new DOMException("", "NotFoundError"))).toMatch(
      /Nenhuma câmera/,
    );
  });

  it("uses a generic fallback for unsupported errors", () => {
    expect(cameraErrorMessage(new Error("unsupported"))).toMatch(
      /entrada manual/,
    );
  });

  it("keeps EAN-8 support distinct from unsupported UPC-E", () => {
    expect(SUPPORTED_BARCODE_FORMATS).toContain("EAN_8");
    expect(SUPPORTED_BARCODE_FORMATS).not.toContain("UPC_E");
  });

  it("suppresses only immediate duplicate values", () => {
    const duplicate = createDuplicateGuard(1000);
    expect(duplicate("789", 1000)).toBe(false);
    expect(duplicate("789", 1500)).toBe(true);
    expect(duplicate("123", 1600)).toBe(false);
    expect(duplicate("123", 3000)).toBe(false);
  });
});
