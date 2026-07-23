# Code Cat

Code Cat is an early VS Code prototype for **debug-driven Python code reading**. It turns a learner's question into a candidate reading route, links that route to real breakpoints, and updates the map from the actual call stack whenever `debugpy` pauses.

## Current vertical slice

- Build a cached structural index of Python files, classes, functions, and async functions.
- Ask an available VS Code language model to propose 3–8 high-value reading stops.
- Open every proposed stop in the editor and toggle a linked source breakpoint from the map.
- Observe Python/debugpy Debug Adapter Protocol traffic without replacing the Python debugger.
- Capture the real call stack and bounded top-frame variables at each pause.
- Redact common credential-like variable names before display or model use.
- Navigate between route nodes, historical pauses, stack frames, and source code.
- Ask the model to explain the current pause from runtime evidence.

## Try it locally

Prerequisites:

- VS Code 1.105 or newer
- The Microsoft Python and Python Debugger (`debugpy`) extensions
- A VS Code language-model provider for AI route planning and explanations
- Node.js 20 or newer

Then:

```bash
npm install
npm run compile
npm run smoke:vscode
```

Open this repository in VS Code and press `F5`. The extension-development window opens the bundled `examples/python-order-service` workspace.

`npm run smoke:vscode` launches an isolated Extension Host using the installed VS Code application and Microsoft Python extensions. It verifies activation, command registration, debugpy startup, a real breakpoint, and an active stack frame.

1. Open the Code Cat activity-bar view.
2. Ask: `How does checkout validate inventory and charge the customer?`
3. Select **Locate code path**.
4. Toggle breakpoints on proposed route nodes.
5. Select **Start guided debug**.
6. When debugpy pauses, inspect the linked runtime trace, call stack, and variables.
7. Select **Explain current pause**.

The route is a hypothesis; the runtime trace is evidence. Code Cat deliberately displays both.

## Architecture notes

- MVP architecture: `docs/architecture/mvp.md`
- Reusable building blocks research: `docs/research/reusable-building-blocks.md`

## Known prototype limits

- The structural index uses Python declaration scanning, not a complete Python parser.
- Route planning currently makes one model pass; a production version should use symbol/call-hierarchy retrieval followed by a smaller evidence-grounded model pass.
- Variable capture is limited to the top frame and bounded by settings.
- No session persistence, tests, marketplace packaging metadata, telemetry, or multi-root route disambiguation yet.
- The webview currently renders a focused execution map rather than an unrestricted mind-map editor.
