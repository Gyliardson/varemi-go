from varemi_go.catalog import DemoCatalogProvider, ProductNotFoundError
from varemi_go.domain.models import Store


def test_demo_provider_returns_authoritative_quote_with_provenance() -> None:
    provider = DemoCatalogProvider()
    store = Store("store-demo-market", "demo-market", "Mercado Demo", "demo-v1")

    quote = provider.get_quote(store, "7890000000017")

    assert quote.name == "Arroz Demo 1 kg"
    assert quote.unit_price_cents == 2799
    assert quote.currency == "BRL"
    assert quote.price_source == "demo-catalog:v1"


def test_demo_provider_rejects_unknown_product_or_provider() -> None:
    provider = DemoCatalogProvider()
    store = Store("store-demo-market", "demo-market", "Mercado Demo", "demo-v1")
    wrong_provider = Store("store-other", "other", "Other", "other")

    for candidate_store in (store, wrong_provider):
        try:
            provider.get_quote(candidate_store, "7890000000994")
        except ProductNotFoundError:
            pass
        else:
            raise AssertionError("unknown product/provider must not resolve")
