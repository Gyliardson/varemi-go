import { describe, expect, it } from "vitest";
import { formatBRL, formatItemCount } from "./format.js";

describe("format helpers", () => {
  it("formats cents as BRL", () => {
    expect(formatBRL(3448)).toMatch(/34,48/);
  });

  it("formats singular and plural item counts", () => {
    expect(formatItemCount(1)).toBe("1 item");
    expect(formatItemCount(2)).toBe("2 itens");
  });
});
