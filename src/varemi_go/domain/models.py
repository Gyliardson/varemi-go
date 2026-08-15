from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum


class CartState(StrEnum):
    ACTIVE = "active"
    EXPIRED = "expired"


@dataclass(frozen=True, slots=True)
class Store:
    id: str
    slug: str
    name: str
    provider_key: str


@dataclass(frozen=True, slots=True)
class CatalogQuote:
    product_id: str
    barcode: str
    name: str
    unit_price_cents: int
    currency: str
    price_source: str
    price_effective_at: datetime
    promotion_label: str | None = None


@dataclass(frozen=True, slots=True)
class CartItem:
    barcode: str
    product_id: str
    name: str
    quantity: int
    unit_price_cents: int
    currency: str
    price_source: str
    price_effective_at: datetime
    promotion_label: str | None

    @property
    def line_total_cents(self) -> int:
        return self.unit_price_cents * self.quantity


@dataclass(frozen=True, slots=True)
class Cart:
    id: str
    store: Store
    state: CartState
    created_at: datetime
    updated_at: datetime
    expires_at: datetime
    items: tuple[CartItem, ...]

    @property
    def total_cents(self) -> int:
        return sum(item.line_total_cents for item in self.items)


def utc_now() -> datetime:
    return datetime.now(UTC)
