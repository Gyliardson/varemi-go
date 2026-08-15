import { formatBRL, formatItemCount } from "./lib/format.js";
import { storeSlugFromHash } from "./lib/route.js";
import { cameraErrorMessage } from "./lib/scanner-utils.js";
import { startBarcodeScanner } from "./scanner.js";

/** @typedef {{barcode: string, name: string, quantity: number, unitPriceCents: number, lineTotalCents: number, promotionLabel: string | null, priceSource: string}} CartItemView
 * @typedef {{id: string, items: CartItemView[], totalCents: number}} CartView
 */

const storeSlug = storeSlugFromHash(window.location.hash) ?? "demo-market";
const storageKey = `varemi-go:${storeSlug}:session`;

/** @type {{ sessionId: string } | null} */
let sessionCredentials = readCredentials();
/** @type {"recovering" | "active" | "ended"} */
let sessionState = "recovering";
/** @type {{ barcode: string, idempotencyKey: string } | null} */
let pendingAdd = null;
/** @type {(() => void) | null} */
let stopScanner = null;

const elements = {
  storeName: requiredElement("store-name"),
  connectionStatus: requiredElement("connection-status"),
  barcodeForm: /** @type {HTMLFormElement} */ (requiredElement("barcode-form")),
  barcodeInput: /** @type {HTMLInputElement} */ (
    requiredElement("barcode-input")
  ),
  feedback: requiredElement("feedback"),
  cartItems: requiredElement("cart-items"),
  emptyCart: requiredElement("empty-cart"),
  cartTotal: requiredElement("cart-total"),
  itemCount: requiredElement("item-count"),
  cameraButton: /** @type {HTMLButtonElement} */ (
    requiredElement("camera-button")
  ),
  cameraPanel: requiredElement("camera-panel"),
  cameraVideo: /** @type {HTMLVideoElement} */ (
    requiredElement("camera-video")
  ),
  stopCameraButton: /** @type {HTMLButtonElement} */ (
    requiredElement("stop-camera-button")
  ),
  pendingAction: requiredElement("pending-action"),
  retryButton: /** @type {HTMLButtonElement} */ (
    requiredElement("retry-button")
  ),
};

void initialize();

elements.barcodeForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const barcode = elements.barcodeInput.value.trim();
  if (!barcode) return;
  void addBarcode(barcode, crypto.randomUUID());
});

elements.cameraButton.addEventListener("click", () => void openCamera());
elements.stopCameraButton.addEventListener("click", closeCamera);
elements.retryButton.addEventListener("click", () => {
  if (pendingAdd)
    void addBarcode(pendingAdd.barcode, pendingAdd.idempotencyKey);
});

async function initialize() {
  setConnection("Conectando");
  try {
    const store = await apiRequest(
      `/api/stores/${encodeURIComponent(storeSlug)}`,
    );
    elements.storeName.textContent = store.name;
    const cart = await recoverOrCreateSession();
    renderCart(cart);
    setConnection("Online");
  } catch (error) {
    setConnection("Indisponível");
    showError(
      error,
      "Não foi possível abrir a loja. Confira a conexão e tente recarregar.",
    );
  }
}

async function recoverOrCreateSession() {
  if (sessionCredentials) {
    try {
      const cart = await apiRequest(
        `/api/sessions/${sessionCredentials.sessionId}`,
      );
      sessionState = "active";
      return cart;
    } catch (error) {
      if (!isTerminalSessionError(error)) throw error;
      endSession();
    }
  }

  sessionState = "recovering";
  const created = await apiRequest(
    `/api/stores/${encodeURIComponent(storeSlug)}/sessions`,
    {
      method: "POST",
    },
  );
  sessionCredentials = { sessionId: created.cart.id };
  localStorage.setItem(storageKey, JSON.stringify(sessionCredentials));
  sessionState = "active";
  return created.cart;
}

/** @param {string} barcode @param {string} idempotencyKey */
async function addBarcode(barcode, idempotencyKey) {
  const credentials = sessionCredentials;
  if (!credentials || sessionState !== "active") return;
  setBusy(true);
  pendingAdd = { barcode, idempotencyKey };
  elements.pendingAction.hidden = true;
  try {
    const cart = await apiRequest(
      `/api/sessions/${credentials.sessionId}/items`,
      {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: { barcode },
      },
    );
    renderCart(cart);
    pendingAdd = null;
    elements.barcodeInput.value = "";
    elements.feedback.textContent = "Produto adicionado.";
    if (document.activeElement !== elements.barcodeInput)
      elements.barcodeInput.focus();
  } catch (error) {
    if (error instanceof TypeError) {
      elements.pendingAction.hidden = false;
      elements.feedback.textContent = "Conexão interrompida.";
    } else if (isTerminalSessionError(error)) {
      await recoverEndedSession(
        "Sua sessão anterior foi encerrada. Uma nova compra foi iniciada; confirme para tentar adicionar o produto novamente.",
        true,
      );
    } else {
      pendingAdd = null;
      showError(error, "Não foi possível adicionar o produto.");
    }
  } finally {
    setBusy(false);
  }
}

/**
 * @param {string} barcode
 * @param {number} quantity
 * @param {number} expectedQuantity
 */
async function updateQuantity(barcode, quantity, expectedQuantity) {
  const credentials = sessionCredentials;
  if (!credentials || sessionState !== "active") return;
  setBusy(true);
  try {
    const cart = await apiRequest(
      `/api/sessions/${credentials.sessionId}/items/${encodeURIComponent(barcode)}`,
      {
        method: "PATCH",
        body: { quantity, expectedQuantity },
      },
    );
    renderCart(cart);
  } catch (error) {
    if (error instanceof ApiError && error.code === "QUANTITY_CONFLICT") {
      await reconcileQuantityConflict(credentials.sessionId);
    } else if (isTerminalSessionError(error)) {
      await recoverEndedSession(
        "Sua sessão anterior foi encerrada. Uma nova compra vazia foi iniciada.",
        false,
      );
    } else {
      showError(error, "Não foi possível alterar a quantidade.");
    }
  } finally {
    setBusy(false);
  }
}

/** @param {string} sessionId */
async function reconcileQuantityConflict(sessionId) {
  try {
    const cart = await apiRequest(`/api/sessions/${sessionId}`);
    renderCart(cart);
    elements.feedback.textContent =
      "O carrinho mudou em outra aba ou por um novo scan. Estado atualizado; confirme a quantidade novamente.";
  } catch (error) {
    if (isTerminalSessionError(error)) {
      await recoverEndedSession(
        "Sua sessão anterior foi encerrada. Uma nova compra vazia foi iniciada.",
        false,
      );
    } else {
      showError(error, "Não foi possível recuperar o estado atual do carrinho.");
    }
  }
}

/** @param {string} barcode */
async function removeItem(barcode) {
  const credentials = sessionCredentials;
  if (!credentials || sessionState !== "active") return;
  setBusy(true);
  try {
    const cart = await apiRequest(
      `/api/sessions/${credentials.sessionId}/items/${encodeURIComponent(barcode)}`,
      { method: "DELETE" },
    );
    renderCart(cart);
  } catch (error) {
    if (isTerminalSessionError(error)) {
      await recoverEndedSession(
        "Sua sessão anterior foi encerrada. Uma nova compra vazia foi iniciada.",
        false,
      );
    } else {
      showError(error, "Não foi possível remover o item.");
    }
  } finally {
    setBusy(false);
  }
}

async function openCamera() {
  closeCamera();
  elements.cameraPanel.hidden = false;
  try {
    stopScanner = await startBarcodeScanner(elements.cameraVideo, (barcode) => {
      closeCamera();
      elements.barcodeInput.value = barcode;
      void addBarcode(barcode, crypto.randomUUID());
    });
    elements.feedback.textContent = "Aponte a câmera para o código de barras.";
  } catch (error) {
    elements.cameraPanel.hidden = true;
    elements.feedback.textContent = cameraErrorMessage(error);
    elements.barcodeInput.focus();
  }
}

function closeCamera() {
  stopScanner?.();
  stopScanner = null;
  elements.cameraPanel.hidden = true;
  elements.cameraVideo.srcObject = null;
}

/** @param {CartView} cart */
function renderCart(cart) {
  elements.cartItems.replaceChildren();
  for (const item of cart.items) {
    const row = document.createElement("li");
    row.className = "cart-item";
    row.dataset.barcode = item.barcode;
    row.innerHTML = `
      <div class="item-copy">
        <strong></strong>
        <span class="price"></span>
        <span class="provenance"></span>
      </div>
      <div class="item-actions">
        <div class="quantity-control" aria-label="Quantidade de ${escapeText(item.name)}">
          <button type="button" class="quantity-button decrement" aria-label="Diminuir ${escapeText(item.name)}">−</button>
          <span class="quantity" aria-live="polite"></span>
          <button type="button" class="quantity-button increment" aria-label="Aumentar ${escapeText(item.name)}">+</button>
        </div>
        <button type="button" class="remove-button">Remover</button>
      </div>`;
    requiredChild(row, "strong").textContent = item.name;
    requiredChild(row, ".price").textContent =
      `${formatBRL(item.unitPriceCents)} cada · ${formatBRL(item.lineTotalCents)}`;
    requiredChild(row, ".provenance").textContent =
      item.promotionLabel ?? `Preço: ${item.priceSource}`;
    requiredChild(row, ".quantity").textContent = String(item.quantity);
    const decrement = /** @type {HTMLButtonElement} */ (
      requiredChild(row, ".decrement")
    );
    const increment = /** @type {HTMLButtonElement} */ (
      requiredChild(row, ".increment")
    );
    const remove = /** @type {HTMLButtonElement} */ (
      requiredChild(row, ".remove-button")
    );
    decrement.disabled = item.quantity <= 1;
    decrement.addEventListener(
      "click",
      () => void updateQuantity(item.barcode, item.quantity - 1, item.quantity),
    );
    increment.addEventListener(
      "click",
      () => void updateQuantity(item.barcode, item.quantity + 1, item.quantity),
    );
    remove.addEventListener("click", () => void removeItem(item.barcode));
    elements.cartItems.append(row);
  }
  elements.emptyCart.hidden = cart.items.length > 0;
  const units = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  elements.itemCount.textContent = formatItemCount(units);
  elements.cartTotal.textContent = formatBRL(cart.totalCents);
}

/**
 * @param {string} path
 * @param {{method?: string, headers?: Record<string, string>, body?: unknown}} [options]
 */
async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body !== undefined)
    headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(
      data.code ?? "REQUEST_FAILED",
      data.message ?? "Falha na requisição",
    );
  }
  return data;
}

class ApiError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** @param {unknown} error */
function isTerminalSessionError(error) {
  return (
    error instanceof ApiError &&
    ["SESSION_NOT_FOUND", "SESSION_UNAUTHORIZED", "CART_EXPIRED"].includes(
      error.code,
    )
  );
}

function endSession() {
  sessionState = "ended";
  closeCamera();
  localStorage.removeItem(storageKey);
  sessionCredentials = null;
}

/** @param {string} message @param {boolean} preservePendingAdd */
async function recoverEndedSession(message, preservePendingAdd) {
  endSession();
  setConnection("Recuperando");
  try {
    const cart = await recoverOrCreateSession();
    renderCart(cart);
    setConnection("Online");
    elements.pendingAction.hidden = !preservePendingAdd;
    elements.feedback.textContent = message;
  } catch (error) {
    setConnection("Indisponível");
    showError(
      error,
      "A sessão foi encerrada e não foi possível iniciar uma nova compra.",
    );
  }
}

/** @param {unknown} error @param {string} fallback */
function showError(error, fallback) {
  if (error instanceof ApiError && error.code === "PRODUCT_NOT_FOUND") {
    elements.feedback.textContent =
      "Produto não encontrado nesta loja. Confira o código ou siga para o caixa normalmente.";
    return;
  }
  if (error instanceof ApiError && error.code === "INVALID_BARCODE") {
    elements.feedback.textContent =
      "Código de barras inválido. Confira os números impressos no produto.";
    return;
  }
  elements.feedback.textContent =
    error instanceof Error && error.message ? error.message : fallback;
}

/** @param {boolean} busy */
function setBusy(busy) {
  for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (
    document.querySelectorAll("button")
  ))
    button.disabled = busy;
  elements.barcodeInput.disabled = busy;
  if (!busy) {
    for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (
      elements.cartItems.querySelectorAll(".decrement")
    )) {
      const row = button.closest(".cart-item");
      const quantity = Number(
        row?.querySelector(".quantity")?.textContent ?? "1",
      );
      button.disabled = quantity <= 1;
    }
  }
}

/** @param {string} text */
function setConnection(text) {
  elements.connectionStatus.textContent = text;
}

/** @returns {{sessionId: string} | null} */
function readCredentials() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return typeof value.sessionId === "string"
      ? { sessionId: value.sessionId }
      : null;
  } catch {
    return null;
  }
}

/** @param {string} id */
function requiredElement(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required element: ${id}`);
  return element;
}

/** @param {ParentNode} root @param {string} selector */
function requiredChild(root, selector) {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement))
    throw new Error(`Missing required child: ${selector}`);
  return element;
}

/** @param {string} value */
function escapeText(value) {
  /** @type {Record<string, string>} */
  const replacements = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  };
  return value.replace(
    /[&<>'"]/g,
    (character) => replacements[character] ?? character,
  );
}
