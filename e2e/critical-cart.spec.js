import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("mobile shopper can track and recover an authoritative demo cart", async ({
  page,
}) => {
  await page.goto("/#/store/demo-market");

  await expect(
    page.getByRole("heading", { name: "Mercado Demo" }),
  ).toBeVisible();
  await expect(page.getByText("Seu carrinho está vazio.")).toBeVisible();

  const barcode = page.getByLabel("Código de barras");
  await barcode.fill("7890000000017");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("Arroz Demo 1 kg")).toBeVisible();
  await expect(page.getByText("R$ 27,99", { exact: true })).toBeVisible();

  await barcode.fill("7890000000024");
  await page.getByRole("button", { name: "Adicionar" }).click();
  await expect(page.getByText("Leite Demo 1 L")).toBeVisible();
  await expect(page.getByText("R$ 34,48", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Aumentar Arroz Demo 1 kg" }).click();
  await expect(page.getByText("R$ 62,47", { exact: true })).toBeVisible();

  const milkRow = page.locator('[data-barcode="7890000000024"]');
  await milkRow.getByRole("button", { name: "Remover" }).click();
  await expect(page.getByText("Leite Demo 1 L")).toHaveCount(0);
  await expect(page.getByText("R$ 55,98", { exact: true })).toBeVisible();

  const sessionBeforeRefresh = await page.evaluate(() =>
    localStorage.getItem("varemi-go:demo-market:session"),
  );
  await page.reload();
  await expect(page.getByText("Arroz Demo 1 kg")).toBeVisible();
  await expect(page.getByText("R$ 55,98", { exact: true })).toBeVisible();
  await expect(page.getByText("2 itens")).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("varemi-go:demo-market:session"),
    ),
  ).toBe(sessionBeforeRefresh);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("manual fallback reports unknown barcodes without corrupting the cart", async ({
  page,
}) => {
  await page.goto("/#/store/demo-market");
  const barcode = page.getByLabel("Código de barras");

  await barcode.fill("7890000000994");
  await page.getByRole("button", { name: "Adicionar" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Produto não encontrado nesta loja",
  );
  await expect(page.getByText("Seu carrinho está vazio.")).toBeVisible();
  await expect(page.getByText("R$ 0,00", { exact: true })).toBeVisible();
});

test("recovers an ended session during add without silently repeating the mutation", async ({
  page,
}) => {
  const attempts = [];
  let expireNextAdd = true;
  await page.route("**/api/sessions/*/items", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    attempts.push(route.request().headers()["idempotency-key"]);
    if (expireNextAdd) {
      expireNextAdd = false;
      await route.fulfill({
        status: 410,
        contentType: "application/json",
        body: JSON.stringify({
          code: "CART_EXPIRED",
          message: "Cart session has expired",
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/#/store/demo-market");
  await expect(
    page.getByRole("heading", { name: "Mercado Demo" }),
  ).toBeVisible();
  const sessionBefore = await page.evaluate(() =>
    localStorage.getItem("varemi-go:demo-market:session"),
  );

  const barcode = page.getByLabel("Código de barras");
  await barcode.fill("7890000000017");
  await page.getByRole("button", { name: "Adicionar" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Uma nova compra foi iniciada",
  );
  await expect(page.getByText("Seu carrinho está vazio.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tentar novamente" }),
  ).toBeVisible();
  expect(attempts).toHaveLength(1);
  const sessionAfter = await page.evaluate(() =>
    localStorage.getItem("varemi-go:demo-market:session"),
  );
  expect(sessionAfter).not.toBe(sessionBefore);

  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByText("Arroz Demo 1 kg")).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toBe(attempts[0]);
});
