import { expect, test } from "@playwright/test";

function parseRgb(color) {
  const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length !== 3) {
    throw new Error(`Unsupported color: ${color}`);
  }
  return channels;
}

function relativeLuminance(color) {
  const [red, green, blue] = parseRgb(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

async function expectMinimumTouchTarget(locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function expectAccessibleFocus(locator, adjacentBackground) {
  await expect(locator).toBeFocused();
  const focus = await locator.evaluate((element) => {
    const styles = getComputedStyle(element);
    return {
      color: styles.outlineColor,
      offset: styles.outlineOffset,
      style: styles.outlineStyle,
      width: styles.outlineWidth,
    };
  });
  expect(focus.width).toBe("3px");
  expect(focus.offset).toBe("3px");
  expect(focus.style).toBe("solid");
  expect(contrastRatio(focus.color, adjacentBackground)).toBeGreaterThanOrEqual(
    3,
  );
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
});

test("polish text colors keep normal-text contrast", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 844 });
  await page.goto("/#/store/demo-market");

  const barcode = page.getByLabel("Código de barras");
  const placeholder = await barcode.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    color: getComputedStyle(element, "::placeholder").color,
  }));
  expect(
    contrastRatio(placeholder.color, placeholder.background),
  ).toBeGreaterThanOrEqual(4.5);

  const totalMicrocopy = page.locator(".total-copy small");
  await expect(totalMicrocopy).toBeVisible();
  const totalMicrocopyColor = await totalMicrocopy.evaluate(
    (element) => getComputedStyle(element).color,
  );
  expect(
    contrastRatio(totalMicrocopyColor, "rgb(248, 251, 255)"),
  ).toBeGreaterThanOrEqual(4.5);
});

test("mobile controls keep visible focus and 44px touch targets at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/#/store/demo-market");

  const cameraButton = page.getByRole("button", { name: "Usar câmera" });
  const cameraPanel = page.locator("#camera-panel");
  await cameraPanel.evaluate((element) => {
    element.hidden = false;
  });
  const closeCameraButton = page.getByRole("button", {
    name: "Fechar câmera",
  });

  await expectMinimumTouchTarget(closeCameraButton);
  await page.keyboard.press("Tab");
  await expectAccessibleFocus(cameraButton, "rgb(255, 255, 255)");
  await page.keyboard.press("Tab");
  await expectAccessibleFocus(closeCameraButton, "rgb(7, 20, 42)");
  await page.keyboard.press("Tab");

  const barcode = page.getByLabel("Código de barras");
  await expectAccessibleFocus(barcode, "rgb(255, 255, 255)");
  await page.keyboard.press("Tab");

  const addButton = page.getByRole("button", { name: "Adicionar" });
  await expectAccessibleFocus(addButton, "rgb(255, 255, 255)");

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

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expectAccessibleFocus(decrement, "rgb(247, 250, 255)");
  await page.keyboard.press("Tab");
  await expectAccessibleFocus(increment, "rgb(247, 250, 255)");
  await page.keyboard.press("Tab");
  await expectAccessibleFocus(remove, "rgb(255, 255, 255)");

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
