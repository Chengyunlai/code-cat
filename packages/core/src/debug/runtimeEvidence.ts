import { DapVariable, VariableSnapshot } from "../domain/model";

const SENSITIVE_VARIABLE =
  /(?:password|passwd|secret|token|api[_-]?key|authorization|cookie|credential|private[_-]?key)/iu;
const DEBUGGER_GROUP = /^(?:special|function|class|protected|return) variables$/iu;
const MAX_VARIABLE_VALUE_LENGTH = 240;

export function normalizeRuntimeVariables(
  candidates: unknown,
  limit: number,
): readonly VariableSnapshot[] {
  if (!Array.isArray(candidates)) {
    return [];
  }
  const maximum = Math.max(0, Math.floor(limit));
  const seen = new Set<string>();
  const snapshots: VariableSnapshot[] = [];

  for (const candidate of candidates) {
    if (snapshots.length >= maximum || !isDapVariable(candidate)) {
      continue;
    }
    const name = candidate.name.trim();
    if (!name || DEBUGGER_GROUP.test(name) || seen.has(name)) {
      continue;
    }
    seen.add(name);
    snapshots.push({
      name,
      value: SENSITIVE_VARIABLE.test(name)
        ? "<redacted by Code Cat>"
        : normalizeVariableValue(candidate.value),
      type: candidate.type?.trim() || undefined,
    });
  }
  return snapshots;
}

function normalizeVariableValue(value: string): string {
  const singleLine = value
    .replaceAll("\0", "")
    .replace(/\\r\\n|\\n|\\r/gu, " ↵ ")
    .replace(/\\t/gu, " ⇥ ")
    .replace(/\r?\n|\r/gu, " ↵ ")
    .replace(/\s+/gu, " ")
    .trim();
  return singleLine.length <= MAX_VARIABLE_VALUE_LENGTH
    ? singleLine
    : `${singleLine.slice(0, MAX_VARIABLE_VALUE_LENGTH - 1)}…`;
}

function isDapVariable(value: unknown): value is DapVariable {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as Partial<DapVariable>).name === "string" &&
    typeof (value as Partial<DapVariable>).value === "string"
  );
}
