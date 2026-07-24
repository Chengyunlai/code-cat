# Code Cat

Code Cat helps a learner understand a Python project by combining model-guided reading routes with runtime debugger evidence.

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
