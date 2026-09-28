# 从中文问题到命中的文件

运行：

```bash
node examples/stage-06-retrieval-and-pause-binding/user_code/main.cjs
```

输出：

```text
问题：权限是怎么检查的
问题里能直接提取的检索词：[]
不带扩展词，permission.ts 进入摘录：false
带扩展词，permission.ts 进入摘录：true
```

使用者只做两件事：提一个问题，看检索回来的摘录里有什么。`extractRetrievalTerms` 是公开入口，`promptContext` 是它的下游。

第三行说明问题所在：中文提问提不出任何标识符，检索退化为按路径顺序取前几个文件，与问题无关的 `catalog.ts` 排在了 `permission.ts` 前面。第四行是加入扩展词之后——`authorize` 命中真实符号，`permission.ts` 进入摘录。

真实链路里扩展词由模型生成（`AiTutor.retrievalHints`）。示例里手写 `['authorize']`，是为了不依赖模型也能复现这条路径。

`FileProject` 是 JetBrains 宿主的 `ProjectContext` 实现，普通 Node 下可直接运行；VS Code 宿主的同名实现依赖编辑器 API，需要在扩展宿主里跑。
