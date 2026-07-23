import * as path from "node:path";
import * as vscode from "vscode";
import { SourceLocation } from "../domain/model";

export function locationKey(location: SourceLocation): string {
  return `${normalizePath(location.path)}:${location.line}`;
}

export function normalizePath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function toVscodeLocation(location: SourceLocation): vscode.Location {
  return new vscode.Location(
    vscode.Uri.file(location.path),
    new vscode.Position(
      Math.max(0, location.line - 1),
      Math.max(0, location.column - 1),
    ),
  );
}

export async function revealLocation(location: SourceLocation): Promise<void> {
  const document = await vscode.workspace.openTextDocument(location.path);
  const editor = await vscode.window.showTextDocument(document, {
    preview: true,
    preserveFocus: false,
  });
  const position = new vscode.Position(
    Math.max(0, location.line - 1),
    Math.max(0, location.column - 1),
  );
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(
    new vscode.Range(position, position),
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  );
}

