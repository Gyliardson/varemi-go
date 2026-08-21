import { expect, test } from "@playwright/test";

function emitScreenshot(label, screenshot) {
  console.log(`VAREMI_VISUAL_${label}:${screenshot.toString("base64")}`);
}

test("captures item-count placement for visual review", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#/store/demo-market");
  await expect(page.getByText("Seu carrinho está vazio.")).toBeVisible();
  emitScreenshot("COUNT_EMPTY_390", await page.screenshot({ fullPage: true }));

  await page.setViewportSize({ width: 320, height: 844 });
  emitScreenshot("COUNT_EMPTY_320", await page.screenshot({ fullPage: true }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("Código de barras").fill("7890000000017");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.locator("#item-count-value")).toHaveText("1 item");
  emitScreenshot(
    "COUNT_POPULATED_390",
    await page.screenshot({ fullPage: true }),
  );
});
