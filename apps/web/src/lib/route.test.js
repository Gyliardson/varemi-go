import { describe, expect, it } from "vitest";
import { storeSlugFromHash } from "./route.js";

describe("store route", () => {
  it("extracts a store slug from the QR-compatible hash route", () => {
    expect(storeSlugFromHash("#/store/demo-market")).toBe("demo-market");
  });

  it("rejects unrelated routes", () => {
    expect(storeSlugFromHash("#/other/demo-market")).toBeNull();
    expect(storeSlugFromHash("")).toBeNull();
  });
});
