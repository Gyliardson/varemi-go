from __future__ import annotations

from datetime import UTC, datetime

from varemi_go.catalog.base import ProductNotFoundError
from varemi_go.domain.models import CatalogQuote, Store

_DEMO_EFFECTIVE_AT = datetime(2026, 8, 15, 12, 0, tzinfo=UTC)

_DEMO_PRODUCTS: dict[str, tuple[str, str, int, str | None]] = {
    "7890000000017": ("demo-arroz-1kg", "Arroz Demo 1 kg", 2799, None),
    "7890000000024": ("demo-leite-1l", "Leite Demo 1 L", 649, "Preço demo"),
    "7890000000031": ("demo-cafe-500g", "Café Demo 500 g", 1890, None),
}


class DemoCatalogProvider:
    """Deterministic provider implementing the same boundary expected from a retailer adapter."""

    def get_quote(self, store: Store, barcode: str) -> CatalogQuote:
        if store.provider_key != "demo-v1":
            raise ProductNotFoundError(barcode)
        product = _DEMO_PRODUCTS.get(barcode)
        if product is None:
            raise ProductNotFoundError(barcode)
        product_id, name, price_cents, promotion = product
        return CatalogQuote(
            product_id=product_id,
            barcode=barcode,
            name=name,
            unit_price_cents=price_cents,
            currency="BRL",
            price_source="demo-catalog:v1",
            price_effective_at=_DEMO_EFFECTIVE_AT,
            promotion_label=promotion,
        )
