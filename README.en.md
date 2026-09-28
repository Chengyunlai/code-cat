# Code Cat

[简体中文](./README.md) | **English**

[![License: MIT](https://img.shields.io/github/license/Chengyunlai/code-cat)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.105-007ACC)](https://code.visualstudio.com/)
[![JetBrains Marketplace](https://img.shields.io/jetbrains/plugin/v/34438)](https://plugins.jetbrains.com/plugin/34438-code-cat)

Code Cat is an AI code-reading plugin for Python, TypeScript and JavaScript projects. Given one question, it locates the relevant code, lets you observe it at a real breakpoint, and keeps a conversation going with the AI: which statements are observed facts, which are source-based inferences, and how to verify the next step.

Current versions: VS Code extension `0.2.9`, JetBrains preview plugin `0.2.12-preview`. Full release history is in [CHANGELOG.md](CHANGELOG.md).

## Contents

- [What it is, and what it is not](#what-it-is-and-what-it-is-not)
- [Quick start](#quick-start)
- [Core capabilities](#core-capabilities)
- [Install](#install)
- [Model providers and configuration](#model-providers-and-configuration)
- [API keys, privacy and model usage](#api-keys-privacy-and-model-usage)
- [Using Code Cat](#using-code-cat)
- [Code-understanding output contract](#code-understanding-output-contract)
- [Build and test from source](#build-and-test-from-source)
- [Repository layout](#repository-layout)
- [Current limitations](#current-limitations)
- [Contributing](#contributing)
- [Licence](#licence)
- [Further reading](#further-reading)

## What it is, and what it is not

### What it is

- A **code-reading** tool: it turns one question into a reading path you reveal step by step, instead of dumping a whole speculative chain at once.
- A **debug-driven** verification tool: call stacks and variables only become runtime evidence after a real breakpoint is hit.
- An assistant that **separates fact from inference**: model answers, reading paths and debug evidence are presented as three distinct kinds of information.

### What it is not

- **Not a code-writing agent.** Code Cat does not write your business logic, and never executes model-generated expressions.
- **Not a full Python / TypeScript parser.** The structural index is declaration scanning, not compiler-grade analysis.
- **Not a debugger replacement.** It observes the debug sessions you already run and places temporary teaching breakpoints; it never takes over or removes your own breakpoints.
- **Not a browser debugging tool.** TSX / JSX can be read; execution needs your project's own Node build configuration.

### Project status

An actively developed early prototype, not yet published to the VS Code Marketplace.

- **VS Code host:** Python and TS / JS code reading plus Python / Node debugging are verified.
- **JetBrains host:** free preview. WebStorm 2025.1 has been verified with a real TypeScript breakpoint and JCEF page rendering; PyCharm 2026.1 has been verified for plugin loading and JCEF host creation, while Python breakpoints remain unverified. Variables and full call stacks are not implemented yet.
- APIs and stored workspace data may still change before a stable release.

## Quick start

1. Install **VS Code 1.105 or newer**.
2. Generate a `code-cat-*.vsix` with [Build and test from source](#build-and-test-from-source), then follow [Install](#install).
3. Open a Python / TS / JS project **as a folder**. For Python projects, run **Python: Select Interpreter** and choose the environment that can run it.
4. Run **Code Cat: Configure Model Provider** and choose a provider. The default is the VS Code built-in model, which needs no extra key.
5. Ask a question in the Code Cat view, for example “How does checkout validate inventory and charge the customer?”, read the core code location, then select **Use a breakpoint to follow this** to observe real execution.

To see it working first, run a bundled example:

```bash
python3 examples/stage-01-pause-conversation/user_code/main.py
node examples/stage-02-node-conversation/user_code/main.js
```

## Core capabilities

### Guided exploration from purpose to pause

The local `0.2.12-preview` starts code questions with the feature's purpose, responsibility and place in the project before following a focused source path. A debugger pause separates source-based clues from observed runtime facts and offers three editable follow-up prompts: role, mechanism and next verification. The user chooses when to send or step; missing variables and stack frames are never invented. Try the [Stage 05 checkout example](examples/stage-05-guided-depth/user_code/README.md). The Marketplace version `0.2.3-preview` predates these changes and also lacks the later retrieval, path-accumulation and request-liveness fixes; it only covers the 2025.1 line.

A compact code-organization diagram sits beside the route answer. It groups only source files located for this exploration by directory, labels each file with the module's responsibility (falling back to the stop title when the model did not provide one), and opens source when clicked. Its connectors mean containment, never calls or runtime execution.

Each stop on the reading path explains two things separately: **responsibility** — why this file or module exists — and **relation** — how it connects to the previous stop, meaning who calls whom, where the data comes from, and which boundary is crossed. Both are presented separately from the reason the line was chosen, and both are model inferences, never written up as runtime facts. Missing fields are simply not rendered.

The reading path accumulates around **one exploration goal**. The first question names the goal and its first stops; follow-up questions on the same goal append only the stops they add, keep the stops and expansion state already on the path, and continue the summary instead of repeating the overview. The path card states "N stops, K added by this question" and marks the new stops. When the model thinks you switched features, the card only announces it and offers a "start a new exploration goal" action — nothing is silently dropped, and captured runtime evidence is not cleared. See the [Stage 07 three-question example](examples/stage-07-exploration-continuity/user_code/README.md).

Questions may be written in Chinese. Retrieval first turns the Chinese intent into candidate code identifiers (for example 「权限是怎么检查的」 → `authorize`), then validates them against real symbols in the project; a candidate that matches nothing scores zero and never invents a file. A question that already names an identifier costs no extra model call. After a pause, design questions are answered with project retrieval alongside the original observation, and the observation itself stays in context.

### Capability list

- Build a reusable structural index of Python files, classes, functions and async functions.
- Plan up to eight high-value code locations for the current question, while revealing only the most relevant one by default.
- Accumulate follow-up questions under one goal into a single reading path, appending only new stops and marking them as added.
- Show the exploration goal, path start, context notes and exact source jumps beneath each answer.
- Reveal the path progressively rather than presenting a complete speculative chain.
- Optionally place a temporary Code Cat breakpoint at the core location and start `debugpy`.
- Capture the real call stack and bounded top-frame variables at each pause.
- Explain "what happened, why it matters, where to look next" from runtime evidence.
- Keep every pause and explanation in one conversation; ordinary follow-ups automatically carry the selected pause, the source captured at that pause, and recent conversation.
- Keep editing a draft or stop the answer while a request is pending; cancelled, failed and late replies never replace the current observation.
- Navigate between files, path nodes, historical pauses, stack frames and source code.
- Keep recent code-reading conversations in the current workspace without writing chat files into the project.
- Track model token usage for the last request, the current conversation and the current project.
- Redact common credential, token and password fields before displaying or sending variables.

### Three kinds of information, kept apart

1. **Model answers** address only the current question.
2. **Path maps** are reading hypotheses that still need verification.
3. **Call stacks and variables** come only from real debugger pauses, never from the model.

## Install

### VS Code

#### Prerequisites

- VS Code 1.105 or newer.
- Python projects: Python 3.9 or newer. Node projects: whatever Node.js version your project requires.
- Either the VS Code built-in model, or an API key for one of the [supported providers](#model-providers-and-configuration).
- Node.js 22 or newer only when building Code Cat from source.

#### 1. Prepare the project runtime

TS / JS projects use VS Code's built-in language service and Node debugger. Install the Node.js version required by your project. Python extensions are only required for Python debugging:

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
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" \
  --install-extension ms-python.python
```

#### 2. Install Code Cat

Code Cat is not published to the VS Code Marketplace yet. Follow [Build and test from source](#build-and-test-from-source) to generate a `code-cat-*.vsix` package, then either:

1. Open the VS Code Extensions view.
2. Open the `...` menu.
3. Select **Install from VSIX...** and choose the file.

Or install it from a terminal:

```bash
code --install-extension "/absolute/path/to/code-cat-X.Y.Z.vsix" --force
```

Replace the example path and `X.Y.Z` with the exact package path and version printed by `npm run package`.

After installation, run **Developer: Reload Window** from the Command Palette so the Code Cat activity-bar icon and commands are loaded.

#### 3. Select the interpreter and configure a provider

1. Open the project as a folder, not just an individual file.
2. For Python projects, run **Python: Select Interpreter** and choose the environment that can run the project.
3. Open the model-provider action under **More**, or run **Code Cat: Configure Model Provider**.
4. Choose a provider, confirm its model, and enter its API key when required.
5. Select **Test connection** after saving, or run **Code Cat: Test Model Provider** later.

The default option is **VS Code built-in model**, which uses the VS Code Language Model API and does not ask Code Cat for a key. See [Model providers and configuration](#model-providers-and-configuration) for the direct-API options.

### JetBrains preview

The free JetBrains preview is public on the [JetBrains Marketplace](https://plugins.jetbrains.com/plugin/34438-code-cat); the published version `0.2.3-preview` only supports the 2025.1 line. The newest local build is `0.2.12-preview`, which detects the Node.js runtime automatically; follow the [JetBrains guide](plugins/jetbrains/README.md) to install it from disk and try the latest changes. Release and update procedures live in [MARKETPLACE.md](plugins/jetbrains/MARKETPLACE.md), and the privacy notice in [PRIVACY.md](plugins/jetbrains/PRIVACY.md).

PyCharm 2026.1 has a separate local build; plugin loading and JCEF host creation are verified, while Python breakpoints remain untested. JetBrains variable capture and full call stacks are not implemented yet.

## Model providers and configuration

Besides the default VS Code built-in model, Code Cat supports configuring these APIs directly:

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

For NewAPI, enter the API root such as `https://newapi.example.com/v1`, not the full `/chat/completions` endpoint. The model must be the exact model or alias exposed by that NewAPI deployment. HTTPS is required except for `localhost` development endpoints.

## API keys, privacy and model usage

API keys are stored with VS Code `SecretStorage`; they are not written to the repository, workspace settings, user `settings.json`, logs, or model prompts.

For NewAPI and compatible services, each key is bound to its normalized API root, so changing the Base URL never reuses the old endpoint's key. Code Cat also rejects HTTP redirects itself, so an authorization header cannot silently follow one.

Non-secret providers, per-provider models and Base URLs remain visible under `Code Cat › AI` in VS Code Settings. Run **Code Cat: Clear Stored API Key** to delete the key for the current provider and API root.

After the first model request, Code Cat shows a compact item in the VS Code status bar. Click it or run **Code Cat: Show Model Usage** to open the native picker with three scopes:

- **Last request** shows input, output, cache-read and total tokens.
- **Current conversation** separates provider-reported and locally estimated values.
- **Current project** accumulates across conversations, stored only in the local `workspaceState`.

Starting a new conversation clears the current-conversation and last-request values but keeps the project total. Run **Code Cat: Reset Project Token Usage** to clear only the project total.

OpenAI, OpenAI-compatible, NewAPI, Anthropic and Gemini usage fields are normalized into the same display. When a provider omits usage, Code Cat marks the value as **Estimated**; it helps compare context size but is not a bill.

For repeated questions in the same project, Code Cat reuses its in-memory Python index until a Python file changes, and places stable instructions and stable symbol prefixes at the front of the prompt to take advantage of automatic prefix caching.

## Using Code Cat

### Conversations and progressive exploration

The first message gives the conversation its title. Related follow-ups remain in one conversation until you run **Code Cat: New Conversation**.

Click the conversation title at the top of the Code Cat view to:

- Start a new conversation and remove the temporary breakpoints Code Cat created.
- Reopen a historical conversation, restoring its messages, latest reading path and expansion state.
- Keep up to 20 recent non-empty conversations in the current workspace.

Conversations are stored in VS Code `workspaceState`; no chat file is written into a Python project.

For a code question, the initial answer addresses only that question and introduces the **exploration goal** plus the first location on the path (labelled **core code location** when the path has one stop, or **reading path start** when it has more):

- It shows the file, the exact line and the node title.
- It explains why you should look here first.
- **Open code** jumps to the source line.
- The path view under **More** shows the revealed reading path.
- **Continue to next location** in the path view reveals one more location at a time.
- Ask follow-ups directly in the composer to focus on a branch, function or failure case; follow-ups under the same goal append their new stops to the same path.

A path map is a reading hypothesis, not a runtime call stack. Call stacks and variables only become citable runtime evidence after a real breakpoint is hit.

### First guided-debug session

1. Open the Code Cat activity-bar view.
2. Type a normal message, or ask a project question such as `How does checkout validate inventory and charge the customer?`.
3. Press **Enter** to send or **Shift+Enter** to add a line break.
4. Read the answer and its **core code location**; select **Open code** when needed.
5. To observe execution, select **Use a breakpoint to follow this**.

Code Cat places a temporary teaching breakpoint at the core location and resolves what to run in this order:

1. A Python/debugpy configuration already present in `.vscode/launch.json`.
2. A console entry point declared under `[project.scripts]` in `pyproject.toml`.
3. The currently open Python file.

When Code Cat finds multiple launch configurations or project scripts, it asks you to choose. Once debugging starts, the path map marks the execution position; after a pause, the call stack and variables update together.

VS Code may switch to the Run and Debug view when it starts debugging. Return to Code Cat after the pause: the conversation now contains an observation showing the source at the pause. Select **Explain** or keep asking questions — no need to switch tabs.

- **Step to verify** runs the current line and pauses at the next one (Step Over).
- **Step into** enters the current call.
- **Continue** runs to the next breakpoint or to the end.
- **Explain this pause** explains the currently selected observation in the conversation.

Only **Step to verify** and **More** stay above the composer. Step Into, Continue, historical observations, path views and model settings all live under **More**, where the evidence selector switches between historical observations. Historical observations can be read and asked about, but cannot control execution. Expand **View evidence** for the full call stack, variables and source. Answered observations stop showing duplicate explain and follow-up buttons.

The composer stays editable while an answer is streaming; select **Stop answer** to cancel the request. On failure, the original question is restored only into an empty composer, so it never overwrites a newer draft. The highlighted statement normally has not executed yet, so explanations must distinguish facts, inferences and unknowns.

Raw snapshots live in the current extension process; chat text and observation references are saved to workspace history, and reopened conversations explicitly mark released snapshots.

If the program exits without hitting the teaching breakpoint, Code Cat reports that no runtime evidence was captured and offers **Run again**.

If the debug session was already running before Code Cat began observing it, stop it and start it again from Code Cat so the full runtime chain can be captured.

For installed Python applications using `[project.scripts]`, Code Cat invokes the real entry function through a small launcher bundled with the extension, explicitly using the workspace's selected Python interpreter.

If your program needs command-line arguments, special environment variables or a framework launcher, add a configuration to `.vscode/launch.json`; existing configurations always take priority over auto-discovery.

### Source-line teaching controls

Once a reading path exists, its Python / TS / JS source lines show a restrained `Code Cat · step/title` annotation.

Hover the annotation or the source line to see nearby code, the path context and why the stop matters. Pause explanations and follow-up answers stay in the main conversation.

CodeLens above the exact source line offers progressively richer controls:

- Before a pause: show context, pause here, or remove the teaching breakpoint.
- At a live pause: explain here, continue, step into, step over.
- When a user breakpoint already exists: labelled as preserved — Code Cat never removes it or takes ownership.

If CodeLens is hidden, enable **Editor: Code Lens** (`"editor.codeLens": true`).

Code Cat teaching breakpoints are temporary and are removed automatically when:

- The teaching debug session ends.
- A new path replaces the old one.
- The Code Cat view is closed outside an active debug session.
- **Code Cat: New Conversation** runs.
- The extension is deactivated.

Only breakpoints created by Code Cat are removed. Breakpoints you created manually are preserved, and ordinary follow-ups in the same conversation do not discard the teaching path.

### Appearance and interaction

The interface keeps a reduced set of entry points and uses semantic colour to separate information types: blue for links and primary actions, green for observed information, purple for source inferences, amber for unverified information. Text labels are always kept, so colour alone is never the only signal.

File names at the pause location are clickable and open source; call locations inside expanded evidence are clickable too. Code snippets get basic lexical highlighting, and buttons provide hover, pressed, focus and disabled feedback.

Colours adapt to VS Code light, dark and high-contrast themes by default. Override them per theme through VS Code's `workbench.colorCustomizations`, with no extra settings UI:

| Identifier | Role |
| --- | --- |
| `codeCat.accent` | Links and primary actions |
| `codeCat.accentHover` | Primary action hover |
| `codeCat.onAccent` | Text on primary actions |
| `codeCat.observed` | Observations, current pause, strings |
| `codeCat.inference` | Source inferences, code keywords |
| `codeCat.uncertainty` | Unverified information, numeric literals |

## Code-understanding output contract

Code Cat treats readability as a product invariant rather than leaving presentation to each model response:

- A planned path may only reference validated project files and is limited to 1–8 nodes.
- The initial answer addresses only the current question and does not enumerate the whole path.
- Pause follow-ups combine the snapshot with the source captured at the pause and must distinguish observed facts, source inferences, unknowns and the next verification; simple follow-ups are answered directly.
- Malformed model output is never rendered as raw text.
- Debug variables are normalized once at capture time: duplicates are collapsed, line breaks folded, length bounded and credential-like fields redacted.
- Call stacks follow a "top source location → structured explanation → real stack frames → next debug action" reading order.
- Conversational Markdown is rendered into a small safe subset of DOM elements; model text is never inserted as executable HTML.

## Build and test from source

```bash
npm install
npm run check
npm run package
```

`npm run package` creates a versioned `code-cat-*.vsix` in the repository root.

Open this repository in VS Code and press `F5`; the extension-development window opens the bundled `examples/python-order-service` workspace.

Compiling the repository does not update an already installed VSIX. To verify a change in a normal VS Code window:

1. Run `npm run package`.
2. Reinstall the generated file with **Install from VSIX...**, or run:

   ```bash
   code --install-extension "/absolute/path/to/code-cat-X.Y.Z.vsix" --force
   ```

3. Run **Developer: Reload Window**.

| Command | Purpose |
| --- | --- |
| `npm run check` | Type-check all four tsconfigs |
| `npm run test:engine` | Engine and protocol tests, including streaming, retrieval, timeouts and cancellation |
| `node test/webview/index.cjs` | Real Webview rendering and interaction checks (needs Playwright and Chrome) |
| `npm run smoke:vscode` | Real VS Code Extension Host smoke test |
| `npm run build:jetbrains` | Build the JetBrains local packages |
| `npm run smoke:jetbrains` | Isolated JetBrains host verification |
| `npm run publish:jetbrains` | Upload to the JetBrains Marketplace (needs `PUBLISH_TOKEN`) |

The real VS Code smoke test requires the VS Code application plus the Microsoft Python extensions:

```bash
npm run smoke:vscode
```

The runner uses the default macOS Stable application and discovers Python dependencies from `~/.vscode/extensions`. For a custom installation:

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

The suite covers extension activation, provider adaptation, token usage, breakpoint creation and restoration, debugpy startup, real pauses, captured stack frames and variables, path-map rendering, debug controls and `[project.scripts]` entry points.

Optional UI verification: compile with `npm run compile`, then run `node test/webview/index.cjs` with Playwright resolvable by Node. It uses installed Chrome by default; override its executable with `CODE_CAT_BROWSER_EXECUTABLE`. Output is written to `.vscode-test/ui/`.

Full development conventions, debug entry points and commit rules are in [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/development.md](docs/development.md).

## Repository layout

One repository holds the VS Code host and the JetBrains preview host, sharing the conversation model, index, prompts and UI:

```text
packages/core/             IDE-neutral conversations, indexing, prompts and evidence rules
packages/ui/               shared conversation and diagram UI
packages/engine/           local process protocol for JetBrains
src/                       VS Code host
plugins/jetbrains/         JetBrains host and local packages
docs/                      architecture, research and per-stage implementation records
examples/                  the single canonical example root, organised by stage
test/                      engine, protocol, rendering and timeout regression tests
scripts/                   build, packaging, release and smoke scripts
```

JetBrains packages are built separately for verified IDE build branches. PyCharm plugin loading has been verified; its Python debugger path still needs a real pause test.

## Current limitations

- The structural index uses Python declaration scanning, not a complete Python parser.
- Path planning makes a single model pass today; symbol and call-hierarchy retrieval can be added later.
- Variable capture is limited to the top frame and bounded by settings.
- No dedicated unit-test runner, telemetry or multi-root route disambiguation yet; CI currently only validates documentation links.
- Conversation history is workspace-local rather than cloud-synced.
- The conversation and pause evidence are the main interface; the path view supports progressive reading.
- Name-based variable redaction does not remove every possible secret. Relevant source, the selected snapshot and recent conversation are sent to the chosen model provider when you ask a question.
- The JetBrains host does not capture variables or full call stacks yet, and other JetBrains products have not been verified individually.

A reading path is a hypothesis that still needs verification. Real pauses provide runtime evidence; AI explanations still need to be checked against source and the next execution step.

## Contributing

Pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first: it documents the commit conventions, the verification requirements and the "one pull request, one concern" rule.

- This repository **does not use GitHub Issues to track tasks or schedules**. Design and implementation records live in [`docs/implementation/`](docs/implementation/) and examples in [`examples/`](examples/README.md).
- Every change must run its verification commands, and the pull request description must quote the real output.
- Prefer a pull request when reporting a problem; an issue is fine when you can only describe it. Other contact options are on [@Chengyunlai](https://github.com/Chengyunlai).

## Licence

[MIT](LICENSE) © 2026 Code Cat contributors

## Further reading

- [Documentation index](docs/README.md) — organised by what you want to know
- [Project context](CONTEXT.md) — glossary and per-stage facts
- [Working rules](AGENTS.md) — stable conventions for humans and AI collaborators
- [Development guide](docs/development.md) — environment, layering, verification requirements
- [Roadmap](docs/roadmap.md) — staged, falsifiable assumptions
- [Changelog](CHANGELOG.md) — release history
- [Example index](examples/README.md) — a runnable example per stage
- [MVP architecture](docs/architecture/mvp.md), [reusable building blocks research](docs/research/reusable-building-blocks.md)
- [JetBrains guide](plugins/jetbrains/README.md), [release process](plugins/jetbrains/MARKETPLACE.md), [privacy notice](plugins/jetbrains/PRIVACY.md)
