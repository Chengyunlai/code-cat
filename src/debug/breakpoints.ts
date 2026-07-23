import * as vscode from "vscode";
import { normalizePath, toVscodeLocation } from "../core/locations";
import { SourceLocation } from "../domain/model";

export function hasSourceBreakpoint(location: SourceLocation): boolean {
  return findSourceBreakpoint(location) !== undefined;
}

export function toggleSourceBreakpoint(location: SourceLocation): void {
  const existing = findSourceBreakpoint(location);

  if (existing) {
    vscode.debug.removeBreakpoints([existing]);
    return;
  }
  vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(toVscodeLocation(location), true)]);
}

function findSourceBreakpoint(location: SourceLocation): vscode.SourceBreakpoint | undefined {
  return vscode.debug.breakpoints.find((breakpoint): breakpoint is vscode.SourceBreakpoint => {
    if (!(breakpoint instanceof vscode.SourceBreakpoint)) {
      return false;
    }
    return (
      normalizePath(breakpoint.location.uri.fsPath) === normalizePath(location.path) &&
      breakpoint.location.range.start.line === Math.max(0, location.line - 1)
    );
  });
}
