# Code Cat

Code Cat helps a learner understand a Python project by combining model-guided reading routes with runtime debugger evidence.

## Navigation and verification

Read README.md → AGENTS.md → this file → examples/README.md → the relevant docs/implementation record. `examples/` is the canonical example root; stage examples start with `user_code/`, then `core/`. Keep these entries synchronized when public usage or implementation paths change.

Run `npm run check` and `npm run smoke:vscode`. For rendered UI verification, compile then run `node test/webview/index.cjs` with Playwright available and Chrome installed (or CODE_CAT_BROWSER_EXECUTABLE set).

## Pause conversation flow

`DebugSessionObserver` captures stack, bounded variables and nearby workspace source at pause time. `SessionStore.recordPause` adds an observation to the conversation. Questions capture the selected pause before invoking `AiTutor.answerPauseQuestion`; late answers keep their original pause ID. Ordinary project questions still use route/chat classification when no snapshot exists.

The conversation is the default UI. Observation details expose raw evidence progressively; only the next-step action stays beside the composer; advanced controls, evidence selection and model settings live under More. Users can edit drafts while a request is pending and cancel the active answer. Only the current successfully captured pause can control execution. Source snippets are recorded evidence, not executed-line traces.

Raw snapshots remain in memory. Conversation text and observation references persist; restored conversations label unavailable snapshots explicitly. The current stage is documented in docs/implementation/stage-01.md.

Visual roles are registered under `contributes.colors` as `codeCat.accent`, `accentHover`, `onAccent`, `observed`, `inference`, and `uncertainty`. CSS consumes the corresponding VS Code theme variables; defaults cover light, dark and both high-contrast modes. Users can override them with `workbench.colorCustomizations`. Semantic answer labels retain their text and only color explicit labels, without inferring certainty from arbitrary prose. Source and stack locations navigate through the existing validated frame path. Python highlighting is a safe, lightweight display tokenizer, not a parser.

## Language

**Conversation**:
A user-facing discussion started by one initial question and continued through related follow-ups. It can be archived and reopened independently from a debugger run.
_Avoid_: Session, chat log, debug session

**Code exploration**:
One concrete code-understanding objective inside a conversation. It starts with a concise direction and reveals its reading path only as the learner chooses to continue.
_Avoid_: Full analysis, route dump, debug session

**Reading path**:
An ordered hypothesis of useful source locations for one code exploration, revealed progressively. It guides reading but is not runtime evidence.
_Avoid_: Call stack, complete answer, execution trace

**Debug evidence**:
The call stack and bounded variables captured from a real debugger pause after the learner chooses a breakpoint. It is runtime evidence, not part of the planned reading path.
_Avoid_: Reading path, model guess, static route

**Reported token usage**:
Input, output, cache, and total token counts explicitly returned by the active model provider. It is provider-aligned usage data, not a guarantee of final billing cost.
_Avoid_: Exact cost, guaranteed billable tokens

**Estimated token usage**:
A locally calculated token count used only when the provider does not report usage. It must always be visibly distinguished from reported token usage.
_Avoid_: Actual usage, billable tokens

**Project usage ledger**:
The locally persisted accumulation of reported and estimated token usage for one VS Code workspace project. Starting a new conversation does not reset it, and it is never written into the project repository.
_Avoid_: Billing ledger, repository usage file, global usage total
