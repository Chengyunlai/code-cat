from dataclasses import dataclass


CATALOG = {
    "keyboard": {"stock": 8, "unit_price_cents": 8900},
    "mouse": {"stock": 15, "unit_price_cents": 4900},
}


@dataclass(frozen=True)
class Reservation:
    sku: str
    quantity: int
    total_cents: int


def reserve_inventory(sku: str, quantity: int) -> Reservation:
    item = CATALOG.get(sku)
    if item is None:
        raise ValueError(f"Unknown SKU: {sku}")
    if item["stock"] < quantity:
        raise ValueError(f"Insufficient stock for {sku}")
    return Reservation(
        sku=sku,
        quantity=quantity,
        total_cents=item["unit_price_cents"] * quantity,
    )
