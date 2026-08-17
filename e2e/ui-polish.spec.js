import { expect, test } from "@playwright/test";

async function expectMinimumTouchTarget(locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function expectVisibleFocus(locator) {
  await expect(locator).toBeFocused();
  const outline = await locator.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      color: styles.outlineColor,
      offset: styles.outlineOffset,
      style: styles.outlineStyle,
      width: styles.outlineWidth,
    };
  });
  expect(outline).toEqual({
    color: "rgb(11, 99, 229)",
    offset: "3px",
    style: "solid",
    width: "3px",
  });
}

test("mobile shopper sees clear status, empty state, and add feedback", async ({
  page,
}) => {
  await page.goto("/#/store/demo-market");

  await expect(
    page.getByRole("heading", { name: "Mercado Demo" }),
  ).toBeVisible();
  await expect(page.locator("#connection-status")).toHaveAttribute(
    "data-state",
    "online",
  );
  await expect(page.getByText("Seu carrinho está vazio.")).toBeVisible();

  const emptyCart = page.locator("#empty-cart");
  const emptyCartImage = emptyCart.locator('img[src="/assets/cart-empty.png"]');
  const cartIcon = page.locator('#item-count img[src="/assets/cart-icon.png"]');
  await expect(emptyCartImage).toBeVisible();
  await expect(emptyCartImage).toHaveAttribute("alt", "");
  await expect(cartIcon).toBeVisible();
  await expect(cartIcon).toHaveAttribute("alt", "");
  await expect(page.locator("#item-count-value")).toHaveText("0 itens");

  await expect(
    page.getByText(
      "Este total é um acompanhamento. No MVP atual, os produtos ainda são registrados normalmente no caixa.",
    ),
  ).toBeVisible();

  const barcode = page.getByLabel("Código de barras");
  await barcode.fill("7890000000017");
  await page.getByRole("button", { name: "Adicionar" }).click();

  await expect(page.getByRole("status")).toHaveText("Produto adicionado.");
  await expect(page.getByRole("status")).toHaveAttribute(
    "data-tone",
    "success",
  );
  await expect(page.locator('[data-barcode="7890000000017"]')).toHaveClass(
    /cart-item--fresh/,
  );
  await expect(emptyCart).toBeHidden();
  await expect(page.locator("#item-count-value")).toHaveText("1 item");
});

test("polish keeps the verified accessible text colors", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 844 });
  await page.goto("/#/store/demo-market");

  const barcode = page.getByLabel("Código de barras");
  await expect(barcode).toHaveCSS("background-color", "rgb(255, 255, 255)");
  expect(
    await barcode.evaluate(
      (element) => getComputedStyle(element, "::placeholder").color,
    ),
  ).toBe("rgb(100, 112, 135)");

  const totalMicrocopy = page.locator(".total-copy small");
  await expect(totalMicrocopy).toBeVisible();
  await expect(totalMicrocopy).toHaveCSS("color", "rgb(100, 112, 135)");
});

test("mobile controls keep focus and 44px touch targets at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/#/store/demo-market");

  const cameraButton = page.getByRole("button", { name: "Usar câmera" });
  const cameraPanel = page.locator("#camera-panel");
  await cameraPanel.evaluate((element) => {
    element.hidden = false;
  });
  const closeCamera = page.getByRole("button", { name: "Fechar câmera" });

  await expectMinimumTouchTarget(closeCamera);
  await page.keyboard.press("Tab");
  await expectVisibleFocus(cameraButton);
  await page.keyboard.press("Tab");
  await expectVisibleFocus(closeCamera);
  await page.keyboard.press("Tab");

  const barcode = page.getByLabel("Código de barras");
  await expectVisibleFocus(barcode);
  await page.keyboard.press("Tab");

  const addButton = page.getByRole("button", { name: "Adicionar" });
  await expectVisibleFocus(addButton);

  await cameraPanel.evaluate((element) => {
    element.hidden = true;
  });
  await barcode.fill("7890000000017");
  await addButton.click();

  const row = page.locator('[data-barcode="7890000000017"]');
  const decrement = row.getByRole("button", {
    name: "Diminuir Arroz Demo 1 kg",
  });
  const increment = row.getByRole("button", {
    name: "Aumentar Arroz Demo 1 kg",
  });
  const remove = row.getByRole("button", { name: "Remover" });

  await expectMinimumTouchTarget(decrement);
  await expectMinimumTouchTarget(increment);
  await expectMinimumTouchTarget(remove);

  await increment.click();
  await expect(row.locator(".quantity")).toHaveText("2");

  await barcode.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expectVisibleFocus(decrement);
  await page.keyboard.press("Tab");
  await expectVisibleFocus(increment);
  await page.keyboard.press("Tab");
  await expectVisibleFocus(remove);

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth);
});

test("camera unavailable keeps the manual barcode fallback usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: undefined,
    });
  });
  await page.goto("/#/store/demo-market");

  const cameraButton = page.getByRole("button", { name: "Usar câmera" });
  await cameraButton.click();

  await expect(page.getByRole("status")).toContainText(
    "Não foi possível iniciar a câmera neste navegador",
  );
  await expect(page.getByRole("status")).toHaveAttribute("data-tone", "error");
  await expect(cameraButton).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#camera-panel")).toBeHidden();
  await expect(page.getByLabel("Código de barras")).toBeFocused();
});
