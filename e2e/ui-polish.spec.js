import { expect, test } from "@playwright/test";

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
