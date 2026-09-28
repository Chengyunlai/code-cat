# 从问题进入库存现场

运行 `node --experimental-strip-types examples/stage-05-guided-depth/user_code/checkout.ts`，输出 `可以继续支付`。在 IDE 中打开这个目录，先问 Code Cat：“库存预留在结账流程中起什么作用？它位于哪一步？”理解边界后，沿回答打开 `checkout` 和 `reserveInventory`。

回答旁的组织图只列这次问题定位到的文件。查看它们属于哪个目录，再点击文件进入源码；不要把目录连线理解为运行时调用。若想看实际执行顺序，继续使用阅读路径与真实断点。

在 `reserveInventory` 的 `if (available < order.quantity)` 放断点并使用 Node/TypeScript source map 配置运行。暂停后先确认卡片区分“源码线索”和“真实观察”，再点“先看作用”“再看机制”“验证下一步”之一，将可编辑问题放入输入框。追问时应先把这次暂停放回结账路径，再深入判断与状态修改；没有采集到变量时不能把值编成运行事实。最后由用户主动单步，验证是否进入异常分支或继续到 `stock.set`。
