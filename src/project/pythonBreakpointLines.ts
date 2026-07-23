import * as vscode from "vscode";

const DECLARATION = /^\s*(?:async\s+def|def|class)\b/u;
const HEADER_END = /:\s*(?:#.*)?$/u;
const DOCSTRING_START = /^(?:[rubf]{0,2})?("""|''')/iu;

export function refinePythonBreakpointLine(
  document: vscode.TextDocument,
  suggestedLine: number,
): number {
  const suggestedIndex = Math.min(
    document.lineCount - 1,
    Math.max(0, Math.floor(suggestedLine) - 1),
  );
  const declaration = document.lineAt(suggestedIndex).text;
  if (!DECLARATION.test(declaration)) {
    return suggestedIndex + 1;
  }
  if (hasInlineSuite(declaration)) {
    return suggestedIndex + 1;
  }

  const declarationIndent = indentationWidth(declaration);
  const headerEnd = findHeaderEnd(document, suggestedIndex);
  const firstBodyLine = findBodyLine(document, headerEnd + 1, declarationIndent);
  if (firstBodyLine === undefined) {
    return suggestedIndex + 1;
  }
  return skipDocstring(document, firstBodyLine, declarationIndent) + 1;
}

function findHeaderEnd(document: vscode.TextDocument, start: number): number {
  const maximum = Math.min(document.lineCount - 1, start + 20);
  for (let index = start; index <= maximum; index += 1) {
    if (HEADER_END.test(document.lineAt(index).text.trimEnd())) {
      return index;
    }
  }
  return start;
}

function findBodyLine(
  document: vscode.TextDocument,
  start: number,
  declarationIndent: number,
): number | undefined {
  for (let index = start; index < document.lineCount; index += 1) {
    const text = document.lineAt(index).text;
    const trimmed = text.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    return indentationWidth(text) > declarationIndent ? index : undefined;
  }
  return undefined;
}

function skipDocstring(
  document: vscode.TextDocument,
  bodyLine: number,
  declarationIndent: number,
): number {
  const bodyText = document.lineAt(bodyLine).text.trim();
  const match = DOCSTRING_START.exec(bodyText);
  if (!match?.[1]) {
    return bodyLine;
  }
  const delimiter = match[1];
  const remainder = bodyText.slice(match[0].length);
  let afterDocstring = bodyLine + 1;
  if (!remainder.includes(delimiter)) {
    while (afterDocstring < document.lineCount) {
      if (document.lineAt(afterDocstring).text.includes(delimiter)) {
        afterDocstring += 1;
        break;
      }
      afterDocstring += 1;
    }
  }
  return findBodyLine(document, afterDocstring, declarationIndent) ?? bodyLine;
}

function indentationWidth(value: string): number {
  return /^\s*/u.exec(value)?.[0].replaceAll("\t", "    ").length ?? 0;
}

function hasInlineSuite(value: string): boolean {
  const finalColon = value.lastIndexOf(":");
  if (finalColon < 0) {
    return false;
  }
  const remainder = value.slice(finalColon + 1).trim();
  return Boolean(remainder && !remainder.startsWith("#"));
}
