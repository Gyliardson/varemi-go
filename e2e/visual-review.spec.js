import { expect, test } from "@playwright/test";

function emitScreenshot(label, screenshot) {
  console.log(`VAREMI_VISUAL_${label}:${screenshot.toString("base64")}`);
}

test("captures empty and populated mobile states for visual review", async ({
  page,
}) => {
  await page.goto("/#/store/demo-market");
  await expect(page.getByText("Seu carrinho está vazio.")).toBeVisible();

  emitScreenshot("EMPTY_390", await page.screenshot({ fullPage: true }));

  await page.setViewportSize({ width: 320, height: 844 });
  emitScreenshot("EMPTY_320", await page.screenshot({ fullPage: true }));

  await page.setViewportSize({ width: 390, height: 844 });
  const barcode = page.getByLabel("Código de barras");
  await barcode.fill("7890000000017");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByRole("status")).toHaveText("Produto adicionado.");
  await expect(page.locator('[data-barcode="7890000000017"]')).toBeVisible();

  emitScreenshot("POPULATED_390", await page.screenshot({ fullPage: true }));
});
