from order_service.checkout import CheckoutRequest, checkout


def handle_checkout() -> None:
    request = CheckoutRequest(
        order_id="order-42",
        sku="keyboard",
        quantity=2,
        payment_token="tok_demo",
    )
    result = checkout(request)
    print(f"{result.order_id}: {result.status} ({result.payment_id})")


if __name__ == "__main__":
    handle_checkout()

