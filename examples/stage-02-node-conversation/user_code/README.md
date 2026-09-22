# 从库存问题开始

以文件夹方式打开本目录，打开 `main.js`，在 Code Cat 提问“为什么没有扣款？”。选择源码位置，使用“用断点跟一遍”；也可以在 `reserveInventory` 的 `return available` 处设置断点，再启动 Code Cat 调试。预期观察：stock 为 8、quantity 为 10、available 为 false。继续追问，再用“单步验证”验证结果。

直接运行：`node main.js`，输出“库存不足，未进入扣款步骤”。

`main.ts` 是等价 TypeScript 示例。调试有两种方式：

- 项目已安装 `tsx`：打开 TS 文件，Code Cat 使用该项目的加载器直接启动。
- 编译后调试：先生成 JS 和 source map，再在 `.vscode/launch.json` 使用下面配置。仓库根目录运行 `node node_modules/typescript/bin/tsc examples/stage-02-node-conversation/user_code/main.ts --outDir examples/stage-02-node-conversation/user_code/dist --sourceMap --target ES2022 --module commonjs --skipLibCheck`。

```json
{
  "version": "0.2.0",
  "configurations": [{
    "name": "库存判断（TypeScript）",
    "type": "node",
    "request": "launch",
    "program": "${workspaceFolder}/dist/main.js",
    "outFiles": ["${workspaceFolder}/dist/**/*.js"],
    "sourceMaps": true,
    "console": "integratedTerminal"
  }]
}
```

这里的 workspaceFolder 是本 user_code 目录。断点按 `main.ts::reserveInventory` 定位到 return 语句，避免复制随代码变化的行号。TSX/JSX 可阅读与提问；执行依赖项目构建与 Node 配置，当前不支持浏览器调试。Code Cat 不自动安装加载器或运行猜测的 npm script。
