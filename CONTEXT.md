# Code Cat

Code Cat helps a learner understand a Python project by combining model-guided reading routes with runtime debugger evidence.

## Language

**Reported token usage**:
Input, output, cache, and total token counts explicitly returned by the active model provider. It is provider-aligned usage data, not a guarantee of final billing cost.
_Avoid_: Exact cost, guaranteed billable tokens

**Estimated token usage**:
A locally calculated token count used only when the provider does not report usage. It must always be visibly distinguished from reported token usage.
_Avoid_: Actual usage, billable tokens

**Project usage ledger**:
The locally persisted accumulation of reported and estimated token usage for one VS Code workspace project. Starting a new conversation does not reset it, and it is never written into the project repository.
_Avoid_: Billing ledger, repository usage file, global usage total
