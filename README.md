# Code Cat

Code Cat is an early VS Code prototype for **debug-driven Python code reading**. It turns a learner's question into a candidate reading route, links that route to real breakpoints, and updates the map from the actual call stack whenever `debugpy` pauses.

## Current vertical slice

- Build a cached structural index of Python files, classes, functions, and async functions.
- Ask a configured VS Code or bring-your-own-key model to propose 3–8 high-value reading stops.
- Open every proposed stop in the editor and toggle a linked source breakpoint from the map.
- Observe Python/debugpy Debug Adapter Protocol traffic without replacing the Python debugger.
- Capture the real call stack and bounded top-frame variables at each pause.
- Redact common credential-like variable names before display or model use.
- Navigate between route nodes, historical pauses, stack frames, and source code.
- Ask the model to explain the current pause from runtime evidence.
- Follow one guided workspace with task/debug status, current lesson, execution-path,
  call-stack, and variable tabs, plus a contextual question box fixed at the bottom.

## Install in VS Code

### Prerequisites

- VS Code 1.105 or newer.
- Python 3 installed and available to VS Code.
- Either a model exposed through the VS Code Language Model API, or an API key for one of the providers listed below.
- Node.js 22 or newer only when building Code Cat from source.

### 1. Install the Python extensions

Install these extensions from the VS Code Extensions view:

- **Python** — `ms-python.python` (required)
- **Python Debugger** — `ms-python.debugpy` (required)
- **Pylance** — `ms-python.vscode-pylance` (recommended)
- **Python Environments** — `ms-python.vscode-python-envs` (recommended)

They can also be installed from a terminal:

```bash
code --install-extension ms-python.python
code --install-extension ms-python.debugpy
code --install-extension ms-python.vscode-pylance
code --install-extension ms-python.vscode-python-envs
```

On macOS, if `code` is not found, run **Shell Command: Install 'code' command in PATH** from the VS Code Command Palette. Alternatively, use the application-bundled CLI:

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --install-extension ms-python.python
```

### 2. Install Code Cat

Code Cat is not published to the VS Code Marketplace or a release download yet. Follow [Build and test from source](#build-and-test-from-source) to generate a `code-cat-*.vsix` package, then either:

1. Open the VS Code Extensions view.
2. Open the `...` menu.
3. Select **Install from VSIX...** and choose the file.

Or install it from a terminal:

```bash
code --install-extension "/absolute/path/to/code-cat-X.Y.Z.vsix" --force
```

Replace the example path and `X.Y.Z` with the exact package path and version printed by `npm run package`.

After installation, run **Developer: Reload Window** from the Command Palette so the Code Cat activity-bar icon and commands are loaded.

### 3. Select Python and configure the model provider

1. Open the Python project as a folder, not just an individual file.
2. Run **Python: Select Interpreter** and choose the environment that can run the project.
3. Click the model-provider pill in the Code Cat header, or run **Code Cat: Configure Model Provider**.
4. Choose a provider, confirm its model, and enter its API key when required.
5. Select **Test connection** after saving, or run **Code Cat: Test Model Provider** later.

The default option is **VS Code built-in model**, which keeps the previous Language Model API
behavior and does not ask Code Cat for a key. Direct API configuration supports:

| Provider preset | Protocol | Extra input |
| --- | --- | --- |
| OpenAI | Responses API | API key and editable model |
| Anthropic Claude | Messages API | API key and editable model |
| Google Gemini | `generateContent` | API key and editable model |
| DeepSeek | OpenAI-compatible Chat Completions | API key and editable model |
| Alibaba Qwen | DashScope OpenAI-compatible API | API key and editable model |
| Moonshot / Kimi | OpenAI-compatible API | API key and editable model |
| Zhipu GLM | OpenAI-compatible API | API key and editable model |
| Doubao / Volcengine Ark | OpenAI-compatible API | API key and inference endpoint ID |
| NewAPI | OpenAI-compatible API | API key, Base URL, and channel model name |
| Other compatible service | OpenAI-compatible API | API key, Base URL, and model name |

For NewAPI, enter the API root such as `https://newapi.example.com/v1`, not the full
`/chat/completions` endpoint. The model must be the exact model or alias exposed by that
NewAPI deployment. HTTPS is required except for `localhost` development endpoints.

API keys are stored with VS Code `SecretStorage`; they are not written to the repository,
workspace settings, user `settings.json`, logs, or model prompts. For NewAPI and compatible
services, each Key is bound to its normalized API root, so changing the Base URL never reuses
the old endpoint's Key. Code Cat also rejects HTTP redirects so an authorization header cannot
silently follow one. Non-secret providers, per-provider models, and Base URLs remain visible
under `Code Cat › AI` in VS Code Settings. Run **Code Cat: Clear Stored API Key** to delete the
Key for the current provider and API root.

If Code Cat reports `No VS Code language model is available`, either sign in to a provider that
exposes a model through the VS Code Language Model API, or configure one of the direct API
providers above.

### 4. First guided-debug session

1. Open the Code Cat activity-bar view.
2. Type a normal message to chat with Code Cat, or ask a project question such as `How does checkout validate inventory and charge the customer?`. Code Cat automatically chooses conversation or code-path mode.
3. For a code-path question, wait for the proposed route.
4. Toggle breakpoints on the proposed route nodes.
5. Open the Python entry file or add a Python/debugpy configuration to `.vscode/launch.json`.
6. Select **Start guided debug** and choose a configuration when prompted.
7. When debugpy pauses, return to the Code Cat activity-bar view to inspect the runtime trace, call stack, and variables. VS Code may automatically switch to its Run and Debug view when the session starts.
8. Select **Explain current pause**, **Continue**, **Step Into**, or **Step Over**.

If the debug session was already running before Code Cat began observing it, stop it and start it again from Code Cat so the full runtime chain can be captured.

## Build and test from source

```bash
npm install
npm run check
npm run package
```

Open this repository in VS Code and press `F5`. The extension-development window opens the bundled `examples/python-order-service` workspace. `npm run package` creates a versioned `code-cat-*.vsix` file in the repository root.

The real VS Code smoke test is optional and requires the VS Code application plus the Microsoft Python extensions:

```bash
npm run smoke:vscode
```

The runner automatically uses the default macOS Stable application and discovers Python dependencies from `~/.vscode/extensions`. It links only the explicit Microsoft Python dependencies into `.vscode-test/code-cat-extensions` before launching VS Code. For VS Code Insiders, a custom installation, Windows, Linux, or a non-default extension source directory, provide the relevant absolute paths.

macOS or Linux:

```bash
CODE_CAT_VSCODE_EXECUTABLE="/absolute/path/to/vscode-executable" \
CODE_CAT_VSCODE_EXTENSIONS_SOURCE_DIR="/absolute/path/to/installed/vscode/extensions" \
npm run smoke:vscode
```

Windows PowerShell:

```powershell
$env:CODE_CAT_VSCODE_EXECUTABLE = "C:\absolute\path\to\Code.exe"
$env:CODE_CAT_VSCODE_EXTENSIONS_SOURCE_DIR = "$env:USERPROFILE\.vscode\extensions"
npm run smoke:vscode
```

Set `CODE_CAT_VSCODE_EXTENSIONS_DIR` only when the isolated target itself must move. Point it to a dedicated test directory, never to the normal user extensions directory; the runner populates it with only the allowed Python dependencies.

`npm run smoke:vscode` launches an isolated Extension Host using the installed VS Code application and explicit Microsoft Python extension dependencies. It verifies activation, model-provider command registration, linked breakpoint creation and restoration, debugpy startup, real pauses, captured stack frames and variables, native call-stack data, Runtime Map rendering, and Step Over.

The route is a hypothesis; the runtime trace is evidence. Code Cat deliberately displays both.

### Code-understanding output contract

Code Cat treats readability as a product invariant rather than leaving presentation to each
model response:

- A planned route is limited to validated files and 1–8 bounded nodes; titles, summaries, and
  reasons are length-limited before entering session state.
- A pause explanation must decode into exactly three fields: **what happened**, **why it
  matters**, and **what to inspect next**. Missing or malformed fields are never rendered as raw
  model output; the paused source, fallback explanation, stack, variables, and debug actions stay
  visible with an inline retry message.
- Debug variables are normalized once at capture time: debugger grouping rows are removed,
  duplicate names are collapsed, credential-like names are redacted, line breaks are folded,
  and displayed values are bounded.
- The paused overview follows the reading order **top-frame source location → explanation →
  top-frame runtime evidence → next debug action**. Full call-stack navigation remains in its
  dedicated tab so selecting an upstream caller cannot relabel top-frame evidence.
- Conversational Markdown is rendered into a small safe subset of DOM elements; model text is
  never inserted as executable HTML.

## IDE support and repository layout

The working prototype currently supports **VS Code only**. PyCharm support should stay in
this repository rather than starting a separate product repository: the project index,
route/session domain model, AI prompts, redaction rules, and IDE-neutral message contracts can
be shared, while each IDE keeps its own adapter and UI package.

A future cross-IDE layout can evolve toward:

```text
packages/core/             shared Python indexing, routes, sessions, and tutor contracts
packages/vscode-extension/ current VS Code/debugpy adapter and Webview UI
packages/jetbrains-plugin/ future PyCharm debugger adapter and JetBrains UI
```

Do not create the PyCharm package until the shared contracts have stabilized in the VS Code
vertical slice. JetBrains plugins use a different SDK, build system, debugger APIs, and UI
toolkit, so sharing the whole extension implementation would create more coupling than reuse.
If publishing, release automation, or contributor ownership later diverges substantially, the
JetBrains package can then be split into its own repository without changing the shared
protocol boundary.

## Architecture notes

- MVP architecture: `docs/architecture/mvp.md`
- Reusable building blocks research: `docs/research/reusable-building-blocks.md`

## Known prototype limits

- The structural index uses Python declaration scanning, not a complete Python parser.
- Route planning currently makes one model pass; a production version should use symbol/call-hierarchy retrieval followed by a smaller evidence-grounded model pass.
- Variable capture is limited to the top frame and bounded by settings.
- No session persistence, unit-test suite, CI, marketplace packaging metadata, telemetry, or multi-root route disambiguation yet.
- The webview currently renders a focused execution map rather than an unrestricted mind-map editor.
