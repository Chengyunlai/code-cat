from dataclasses import dataclass

from order_service.inventory import reserve_inventory
from order_service.payments import charge_payment


@dataclass(frozen=True)
class CheckoutRequest:
    order_id: str
    sku: str
    quantity: int
    payment_token: str


@dataclass(frozen=True)
class CheckoutResult:
    order_id: str
    status: str
    payment_id: str


def checkout(request: CheckoutRequest) -> CheckoutResult:
    reservation = reserve_inventory(request.sku, request.quantity)
    payment_id = charge_payment(request.payment_token, reservation.total_cents)
    return CheckoutResult(
        order_id=request.order_id,
        status="confirmed",
        payment_id=payment_id,
    )
