# Code Cat

[简体中文](./README.md) | **English**

Code Cat is an early VS Code prototype for **debug-driven Python code reading**. It turns a
learner's question into a focused answer with a core source location, then optionally links that
location to a real breakpoint and updates the reading path from the actual call stack whenever
`debugpy` pauses.

> **Project status:** active prototype. The current release targets VS Code and Python projects;
> APIs and stored workspace data may change before a stable release.

## Current vertical slice

- Build a cached structural index of Python files, classes, functions, and async functions.
- Ask a configured VS Code or bring-your-own-key model to plan up to eight high-value reading
  stops, while revealing them one at a time instead of presenting a complete chain up front.
- Open each revealed stop in the editor and toggle a linked source breakpoint from the map.
- Observe Python/debugpy Debug Adapter Protocol traffic without replacing the Python debugger.
- Capture the real call stack and bounded top-frame variables at each pause.
- Redact common credential-like variable names before display or model use.
- Navigate between route nodes, historical pauses, stack frames, and source code.
- Ask the model to explain the current pause from runtime evidence.
- Keep an independent, workspace-local history of code-reading conversations and reopen them
  from the conversation title in the Code Cat header.
- Track reported or estimated token usage for the last request, current conversation, and current project.
- Keep user messages visually distinct with a restrained theme-aware surface; press **Enter** to
  send and **Shift+Enter** to insert a line break.
- Keep **Conversation** as the primary surface. Every code-path answer includes one core source
  location with context and a direct editor jump. The learner can then reveal the path
  progressively or choose **Use a breakpoint to follow this**; **Call Stack** and **Variables**
  remain runtime evidence rather than model-planned content.

## Install in VS Code

### Prerequisites

- VS Code 1.105 or newer.
- Python 3.9 or newer installed and available to VS Code; the opened project may require a
  newer version.
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

### Model usage and repeated-project optimization

After the first model request, Code Cat shows a compact pulse item in the **VS Code status bar**.
Hover it for a quick summary, or click it / run **Code Cat: Show Model Usage** to open the
native VS Code picker with three scopes:

- **Last request** shows input, output, cache-read, and total tokens, plus whether the value was
  reported by the provider or estimated locally.
- **Current conversation** accumulates reported and estimated values separately. Running
  **Code Cat: New Conversation** clears this scope and the last-request value. Reopening a
  historical conversation also starts a fresh local usage window; the project total remains.
- **Current project** keeps accumulating across conversations. It is stored in VS Code
  `workspaceState`, never in the project repository. Select **Reset project total** in the
  usage picker or run **Code Cat: Reset Project Token Usage** to clear only this local total.

OpenAI Responses, OpenAI-compatible/NewAPI, Anthropic, and Gemini usage fields are normalized
into the same display. When a direct API omits usage, Code Cat estimates CJK characters at about
one token each and other text at about four characters per token. VS Code built-in models use
their `countTokens` API when available. All such values remain visibly marked **Estimated**:
they help compare context size, but are not a bill or a guarantee of billable tokens. Model
connection tests are also real requests and are recorded as such.

For repeated questions in the same project, Code Cat reuses its in-memory Python index until a
Python file changes. Stable instructions, the file list, and the first 560 deterministically
ordered symbol rows are placed before the small question-ranked symbol tail, recent conversation,
and the current question. This gives providers with automatic prefix caching a long reusable
prompt prefix without removing the 600-symbol broad fallback. When a provider reports cache
reads, the usage picker shows the cached-token counts. Cache behavior remains controlled by the
provider; a zero or absent cache count does not indicate an error. A later retrieval pass can
reduce the broad symbol fallback further without weakening Chinese questions that contain no
English symbol terms.

### Conversations and progressive exploration

The first message gives the conversation its title. The starting question and all related
follow-ups remain one conversation until **Code Cat: New Conversation** is selected. Click the
conversation title beside **Code Cat /** to use the native VS Code picker:

- **New conversation** clears Code Cat-owned temporary breakpoints and starts an independent
  question.
- A historical conversation restores its messages, latest reading path, and how far that path
  had been revealed.
- Up to 20 recent non-empty conversations are stored in VS Code `workspaceState` for the current
  workspace. No conversation file is written to the Python repository.

For a code question, the initial answer addresses only that question and introduces one **Core
code location** with its file, exact line, and the reason it is the best starting point. Select
**Open code** to jump directly to that line. Open **Path map** or select **Continue to next
location** only when that evidence is useful; Code Cat then reveals one additional location in
the map, CodeLens, and source hover. A planned path is a reading hypothesis, not a runtime call
stack. Use **Ask about this location** whenever you want to name the branch, function, or failure
case you care about before revealing more.

### 4. First guided-debug session

1. Open the Code Cat activity-bar view.
2. Type a normal message to chat with Code Cat, or ask a project question such as
   `How does checkout validate inventory and charge the customer?`. Press **Enter** to send or
   **Shift+Enter** to add a line break. Your messages use a subtle background so they stay
   distinct from Code Cat's replies. Code Cat automatically chooses conversation or code-path
   mode.
3. For a code-path question, read the initial answer and its **Core code location**. Select
   **Open code** to inspect the exact source line, or deepen the **Path map** one location at a
   time.
4. If you want to observe the process, select **Use a breakpoint to follow this**. Code Cat places
   a temporary teaching breakpoint at the core location and starts guided debugging. The
   **Path map**, **Call Stack**, and **Variables** surfaces then update from the debugging state;
   stack frames and variables are populated only after a real pause. When possible, Code Cat
   refines a function declaration to its first executable statement.
5. Code Cat resolves what to run in this order:
   - a Python/debugpy configuration already present in `.vscode/launch.json`;
   - a console entry point declared under `[project.scripts]` in `pyproject.toml`;
   - the currently open Python file as a final fallback.
6. Choose an entry when Code Cat finds multiple launch configurations or project scripts.
7. When debugpy pauses, return to the Code Cat activity-bar view to inspect the runtime trace,
   call stack, and variables. VS Code may automatically switch to its Run and Debug view when
   the session starts.
8. Select **Explain current pause**, **Continue**, **Step Into**, or **Step Over**. If the process
   exits without hitting the teaching breakpoint, Code Cat reports that no runtime evidence was
   captured and offers **Run again**.

If the debug session was already running before Code Cat began observing it, stop it and start it again from Code Cat so the full runtime chain can be captured.

For installed Python applications, prefer the `[project.scripts]` route. An implementation file
such as `src/echo/cli/main.py` may only define `main()` and do nothing when executed directly,
while a declaration such as `echo-cli = "echo.cli.main:main"` is the application's real entry
point. Code Cat detects and invokes that callable under debugpy using the interpreter selected by
**Python: Select Interpreter**. Add a `.vscode/launch.json` configuration when the application
requires command-line arguments, special environment variables, a framework-specific launcher,
or another custom startup sequence; that configuration always takes priority.

Code Cat explicitly binds an automatically discovered project script to the interpreter selected
for that workspace. This matters because its small console-script launcher is installed with the
extension rather than stored inside the project; allowing debugpy to infer an interpreter from the
launcher path can accidentally select a global Python instead of the project's environment. If
the debugger still asks to change Python, run **Python: Select Interpreter**, choose the project
environment, and start guided debug again.

### 5. Source-line teaching controls

Once a reading route exists, its Python source lines show a restrained `Code Cat · step/title`
annotation. Hover the annotation or source line to see nearby code, the route context, and why
the stop matters. After a structured pause explanation is available, the hover also includes
**what happened**, **why it matters**, and **what to inspect next**.

CodeLens actions above the exact source line provide progressively richer controls:

- Before a pause: **show context** and **pause here / remove teaching breakpoint**.
- At the live pause: **explain here**, **continue**, **step into**, and **step over**.
- If the line already has a user-created breakpoint, Code Cat labels it as preserved and never
  removes or takes ownership of it.

VS Code enables CodeLens by default. If the actions are hidden, enable **Editor: Code Lens** in
Settings (`"editor.codeLens": true`). The inline annotation and hover remain available when
CodeLens is disabled.

Code Cat teaching breakpoints are temporary. They are removed automatically when the guided
debug session ends, when a new reading route replaces the old route, when the Code Cat view is
closed outside an active debug session, when **Code Cat: New Conversation** starts a clean
conversation, or when the extension is disposed. Only breakpoints created by Code Cat are
removed; manual breakpoints are preserved. Normal follow-up chat inside the same conversation
does not discard its teaching route.

## Build and test from source

```bash
npm install
npm run check
npm run package
```

### Optional design-review workflow

Runtime Map interaction polish follows Emil Kowalski's design-engineering principles: frequent
keyboard actions stay immediate, pointer feedback stays under 160 ms, transitions name their
exact properties, and motion respects reduced-motion preferences. Contributors who want the same
review skill can install it with:

```bash
npx skills@latest add emilkowalski/skills
```

This skill is a contributor tool, not a Code Cat runtime dependency. Restart the coding agent or
open a new task after installation so the newly installed skill is discovered.

Open this repository in VS Code and press `F5`. The extension-development window opens the bundled `examples/python-order-service` workspace. `npm run package` creates a versioned `code-cat-*.vsix` file in the repository root.

### Refresh an installed VSIX after source changes

Editing or compiling the repository does not update a Code Cat extension that was previously
installed from VSIX. After every source change that you want to verify in the normal VS Code
window:

1. Run `npm run package` to rebuild the versioned VSIX.
2. Reinstall that newly generated file with **Install from VSIX...**, or run:

   ```bash
   code --install-extension "/absolute/path/to/code-cat-X.Y.Z.vsix" --force
   ```

3. Run **Developer: Reload Window** in the same VS Code profile that has `local.code-cat`
   installed.

The `--force` flag is required when reinstalling a rebuilt package with the same version number.
If you are using the `F5` extension-development window instead, stop that debug session and start
it again; the already-running extension host does not hot-reload compiled Webview code.

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

`npm run smoke:vscode` launches isolated Extension Hosts using the installed VS Code application
and explicit Microsoft Python extension dependencies. It verifies activation, model-provider
command registration, provider-specific usage normalization and fallback estimation, local usage
ledger behavior, linked breakpoint creation and restoration, debugpy startup, real pauses,
captured stack frames and variables, native call-stack data, progressive Runtime Map rendering,
status-bar token usage,
Step Over, and a `[project.scripts]` entry module that defines—but does not directly call—its
`main()` function.

The route is a hypothesis; the runtime trace is evidence. Code Cat deliberately displays both.

### Code-understanding output contract

Code Cat treats readability as a product invariant rather than leaving presentation to each
model response:

- A planned route is limited to validated files and 1–8 bounded nodes; titles, summaries, and
  reasons are length-limited before entering session state. Its summary answers the current
  question without enumerating the complete route, and only the revealed prefix reaches the UI.
- A pause explanation must decode into exactly three fields: **what happened**, **why it
  matters**, and **what to inspect next**. Missing or malformed fields are never rendered as raw
  model output; the paused source, fallback explanation, stack, variables, and debug actions stay
  visible with an inline retry message.
- Debug variables are normalized once at capture time: debugger grouping rows are removed,
  duplicate names are collapsed, credential-like names are redacted, line breaks are folded,
  and displayed values are bounded.
- The **Call Stack** tab follows the reading order **top-frame source location → structured
  explanation → real frames → next debug action**. Variables stay in their own tab so runtime
  evidence never replaces the conversation.
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
- No dedicated unit-test runner, CI, marketplace publishing metadata, telemetry, or multi-root
  route disambiguation yet. Conversation history is workspace-local rather than cloud-synced.
- The webview currently renders a focused execution map rather than an unrestricted mind-map editor.
