/** @param {unknown} error */
export function cameraErrorMessage(error) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Permissão de câmera negada. Use a entrada manual abaixo.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "Nenhuma câmera compatível foi encontrada. Use a entrada manual.";
  }
  return "Não foi possível iniciar a câmera neste navegador. Use a entrada manual.";
}

/** @param {number} windowMs */
export function createDuplicateGuard(windowMs = 1200) {
  let lastValue = "";
  let lastSeenAt = 0;
  return (
    /** @type {string} */ value,
    /** @type {number} */ now = Date.now(),
  ) => {
    const duplicate = value === lastValue && now - lastSeenAt < windowMs;
    lastValue = value;
    lastSeenAt = now;
    return duplicate;
  };
}
