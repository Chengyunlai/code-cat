"""在库存判断处暂停，再用 Code Cat 连续追问这次运行。"""


def reserve_inventory(stock: int, quantity: int) -> int:
    if stock < quantity:
        raise ValueError("库存不足")
    return stock - quantity


def charge_payment() -> None:
    print("已进入扣款步骤")


def checkout(quantity: int) -> int:
    remaining = reserve_inventory(stock=8, quantity=quantity)
    charge_payment()
    return remaining


if __name__ == "__main__":
    try:
        checkout(quantity=10)
    except ValueError as error:
        print(f"{error}，未进入扣款步骤")
