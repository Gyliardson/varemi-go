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
let recoveredExistingSession = false;

const elements = {
  appShell: requiredElement("app-shell"),
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
  itemCount: requiredElement("item-count-value"),
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
    if (recoveredExistingSession) {
      setFeedback("Sua compra foi recuperada neste dispositivo.", "info");
    }
  } catch (error) {
    setConnection("Indisponível");
    showError(
      error,
      "Não foi possível abrir a loja. Confira a conexão e tente recarregar.",
    );
  }
}

async function recoverOrCreateSession() {
  recoveredExistingSession = false;
  if (sessionCredentials) {
    try {
      const cart = await apiRequest(
        `/api/sessions/${sessionCredentials.sessionId}`,
      );
      sessionState = "active";
      recoveredExistingSession = true;
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
  setFeedback("Consultando produto e preço…", "loading");
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
    renderCart(cart, barcode);
    pendingAdd = null;
    elements.barcodeInput.value = "";
    setFeedback("Produto adicionado.", "success");
    if (document.activeElement !== elements.barcodeInput)
      elements.barcodeInput.focus();
  } catch (error) {
    if (error instanceof TypeError) {
      elements.pendingAction.hidden = false;
      setFeedback("Conexão interrompida.", "error");
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
  setFeedback("Atualizando quantidade…", "loading");
  try {
    const cart = await apiRequest(
      `/api/sessions/${credentials.sessionId}/items/${encodeURIComponent(barcode)}`,
      {
        method: "PATCH",
        body: { quantity, expectedQuantity },
      },
    );
    renderCart(cart);
    setFeedback("Quantidade atualizada.", "success");
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
    setFeedback(
      "O carrinho mudou em outra aba ou por um novo scan. Estado atualizado; confirme a quantidade novamente.",
      "info",
    );
  } catch (error) {
    if (isTerminalSessionError(error)) {
      await recoverEndedSession(
        "Sua sessão anterior foi encerrada. Uma nova compra vazia foi iniciada.",
        false,
      );
    } else {
      showError(
        error,
        "Não foi possível recuperar o estado atual do carrinho.",
      );
    }
  }
}

/** @param {string} barcode */
async function removeItem(barcode) {
  const credentials = sessionCredentials;
  if (!credentials || sessionState !== "active") return;
  setBusy(true);
  setFeedback("Removendo produto…", "loading");
  try {
    const cart = await apiRequest(
      `/api/sessions/${credentials.sessionId}/items/${encodeURIComponent(barcode)}`,
      { method: "DELETE" },
    );
    renderCart(cart);
    setFeedback("Produto removido.", "success");
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
  elements.cameraButton.setAttribute("aria-expanded", "true");
  setFeedback("Iniciando câmera…", "loading");
  try {
    stopScanner = await startBarcodeScanner(elements.cameraVideo, (barcode) => {
      closeCamera();
      elements.barcodeInput.value = barcode;
      void addBarcode(barcode, crypto.randomUUID());
    });
    setFeedback("Aponte a câmera para o código de barras.", "info");
  } catch (error) {
    elements.cameraPanel.hidden = true;
    elements.cameraButton.setAttribute("aria-expanded", "false");
    setFeedback(cameraErrorMessage(error), "error");
    elements.barcodeInput.focus();
  }
}

function closeCamera() {
  stopScanner?.();
  stopScanner = null;
  elements.cameraPanel.hidden = true;
  elements.cameraButton.setAttribute("aria-expanded", "false");
  elements.cameraVideo.srcObject = null;
}

/** @param {CartView} cart @param {string | null} [highlightBarcode] */
function renderCart(cart, highlightBarcode = null) {
  elements.cartItems.replaceChildren();
  for (const item of cart.items) {
    const row = document.createElement("li");
    row.className = "cart-item";
    if (item.barcode === highlightBarcode) {
      row.classList.add("cart-item--fresh");
    }
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
    setFeedback(message, "info");
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
    setFeedback(
      "Produto não encontrado nesta loja. Confira o código ou siga para o caixa normalmente.",
      "error",
    );
    return;
  }
  if (error instanceof ApiError && error.code === "INVALID_BARCODE") {
    setFeedback(
      "Código de barras inválido. Confira os números impressos no produto.",
      "error",
    );
    return;
  }
  setFeedback(
    error instanceof Error && error.message ? error.message : fallback,
    "error",
  );
}

/** @param {boolean} busy */
function setBusy(busy) {
  for (const button of /** @type {NodeListOf<HTMLButtonElement>} */ (
    document.querySelectorAll("button")
  ))
    button.disabled = busy;
  elements.barcodeInput.disabled = busy;
  elements.appShell.setAttribute("aria-busy", String(busy));
  document.body.classList.toggle("is-busy", busy);
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
  const state =
    text === "Online"
      ? "online"
      : text === "Indisponível"
        ? "offline"
        : text === "Recuperando"
          ? "recovering"
          : "connecting";
  elements.connectionStatus.textContent = text;
  elements.connectionStatus.dataset.state = state;
}

/**
 * @param {string} text
 * @param {"neutral" | "success" | "error" | "info" | "loading"} [tone]
 */
function setFeedback(text, tone = "neutral") {
  elements.feedback.textContent = text;
  elements.feedback.dataset.tone = tone;
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
