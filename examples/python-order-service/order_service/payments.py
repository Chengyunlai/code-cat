def charge_payment(payment_token: str, amount_cents: int) -> str:
    if not payment_token.startswith("tok_"):
        raise ValueError("Invalid payment token")
    if amount_cents <= 0:
        raise ValueError("Payment amount must be positive")
    return f"pay_{amount_cents}"

