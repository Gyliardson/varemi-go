from __future__ import annotations

from typing import Protocol

from varemi_go.domain.models import CatalogQuote, Store


class ProductNotFoundError(LookupError):
    """Raised when the configured provider cannot resolve a barcode."""


class CatalogProvider(Protocol):
    def get_quote(self, store: Store, barcode: str) -> CatalogQuote:
        """Resolve the authoritative product and current price for one store."""
