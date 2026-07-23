import * as vscode from "vscode";

const DECLARATION = /^\s*(?:async\s+def|def|class)\b/u;
const ROUTE_NOISE = /^\s*(?:$|#|@|import\s|from\s+\S+\s+import\s)/u;
const DOCSTRING_START = /^(?:[ru]{0,2})?("""|''')/iu;
const MAX_HEADER_LINES = 60;
const MAX_FORWARD_SEARCH_LINES = 24;

interface HeaderBoundary {
  readonly line: number;
  readonly hasInlineSuite: boolean;
}

interface ScannerState {
  bracketDepth: number;
  quote: "'" | '"' | undefined;
  tripleQuoted: boolean;
}

export function refinePythonBreakpointLine(
  document: vscode.TextDocument,
  suggestedLine: number,
  symbol?: string,
): number {
  const suggestedIndex = clampLineIndex(document, suggestedLine - 1);
  const suggestedText = document.lineAt(suggestedIndex).text;
  if (DECLARATION.test(suggestedText)) {
    return refineDeclaration(document, suggestedIndex);
  }
  if (!isRouteNoise(suggestedText)) {
    return suggestedIndex + 1;
  }

  const symbolDeclaration = symbol
    ? findSymbolDeclaration(document, symbol)
    : undefined;
  if (symbolDeclaration !== undefined) {
    return refineDeclaration(document, symbolDeclaration);
  }

  const forwardLine = findForwardExecutableLine(document, suggestedIndex + 1);
  if (forwardLine === undefined) {
    return suggestedIndex + 1;
  }
  return DECLARATION.test(document.lineAt(forwardLine).text)
    ? refineDeclaration(document, forwardLine)
    : forwardLine + 1;
}

function refineDeclaration(document: vscode.TextDocument, declarationLine: number): number {
  const declarationIndent = indentationWidth(document.lineAt(declarationLine).text);
  const boundary = findHeaderBoundary(document, declarationLine);
  if (!boundary || boundary.hasInlineSuite) {
    return declarationLine + 1;
  }
  const firstBodyLine = findBodyLine(document, boundary.line + 1, declarationIndent);
  if (firstBodyLine === undefined) {
    return declarationLine + 1;
  }
  return skipDocstring(document, firstBodyLine, declarationIndent) + 1;
}

function findHeaderBoundary(
  document: vscode.TextDocument,
  start: number,
): HeaderBoundary | undefined {
  const state: ScannerState = {
    bracketDepth: 0,
    quote: undefined,
    tripleQuoted: false,
  };
  const maximum = Math.min(document.lineCount - 1, start + MAX_HEADER_LINES);
  for (let lineIndex = start; lineIndex <= maximum; lineIndex += 1) {
    const text = document.lineAt(lineIndex).text;
    for (let offset = 0; offset < text.length; offset += 1) {
      const character = text[offset];
      if (state.quote) {
        const delimiter = state.tripleQuoted ? state.quote.repeat(3) : state.quote;
        if (
          text.startsWith(delimiter, offset) &&
          !isEscaped(text, offset)
        ) {
          offset += delimiter.length - 1;
          state.quote = undefined;
          state.tripleQuoted = false;
        }
        continue;
      }
      if (character === "#") {
        break;
      }
      if (character === '"' || character === "'") {
        state.quote = character;
        state.tripleQuoted = text.startsWith(character.repeat(3), offset);
        if (state.tripleQuoted) {
          offset += 2;
        }
        continue;
      }
      if (character === "(" || character === "[" || character === "{") {
        state.bracketDepth += 1;
        continue;
      }
      if (character === ")" || character === "]" || character === "}") {
        state.bracketDepth = Math.max(0, state.bracketDepth - 1);
        continue;
      }
      if (character === ":" && state.bracketDepth === 0) {
        const remainder = text.slice(offset + 1).trim();
        return {
          line: lineIndex,
          hasInlineSuite: Boolean(remainder && !remainder.startsWith("#")),
        };
      }
    }
    if (state.quote && !state.tripleQuoted) {
      state.quote = undefined;
    }
  }
  return undefined;
}

function findSymbolDeclaration(
  document: vscode.TextDocument,
  symbol: string,
): number | undefined {
  const bareSymbol = symbol.split(".").at(-1)?.trim();
  if (!bareSymbol || !/^[A-Za-z_]\w*$/u.test(bareSymbol)) {
    return undefined;
  }
  const declaration = new RegExp(
    `^\\s*(?:async\\s+def|def|class)\\s+${escapeRegExp(bareSymbol)}\\b`,
    "u",
  );
  for (let index = 0; index < document.lineCount; index += 1) {
    if (declaration.test(document.lineAt(index).text)) {
      return index;
    }
  }
  return undefined;
}

function findForwardExecutableLine(
  document: vscode.TextDocument,
  start: number,
): number | undefined {
  const maximum = Math.min(
    document.lineCount - 1,
    start + MAX_FORWARD_SEARCH_LINES,
  );
  for (let index = start; index <= maximum; index += 1) {
    if (!isRouteNoise(document.lineAt(index).text)) {
      return index;
    }
  }
  return undefined;
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
  for (let index = bodyLine; index < document.lineCount; index += 1) {
    const text = index === bodyLine ? bodyText : document.lineAt(index).text;
    const searchStart = index === bodyLine ? match[0].length : 0;
    const closingOffset = unescapedDelimiterOffset(text, delimiter, searchStart);
    if (closingOffset < 0) {
      continue;
    }
    const trailing = text.slice(closingOffset + delimiter.length).trim();
    if (trailing && !trailing.startsWith("#")) {
      return bodyLine;
    }
    return findBodyLine(document, index + 1, declarationIndent) ?? bodyLine;
  }
  return bodyLine;
}

function isRouteNoise(value: string): boolean {
  return ROUTE_NOISE.test(value) || DOCSTRING_START.test(value.trim());
}

function unescapedDelimiterOffset(
  value: string,
  delimiter: string,
  start: number,
): number {
  let offset = value.indexOf(delimiter, start);
  while (offset >= 0) {
    if (!isEscaped(value, offset)) {
      return offset;
    }
    offset = value.indexOf(delimiter, offset + delimiter.length);
  }
  return -1;
}

function isEscaped(value: string, offset: number): boolean {
  let backslashes = 0;
  for (let index = offset - 1; index >= 0 && value[index] === "\\"; index -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function clampLineIndex(document: vscode.TextDocument, value: number): number {
  return Math.min(document.lineCount - 1, Math.max(0, Math.floor(value)));
}

function indentationWidth(value: string): number {
  return /^\s*/u.exec(value)?.[0].replaceAll("\t", "    ").length ?? 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
