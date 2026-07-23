import * as vscode from "vscode";
import { normalizePath, toVscodeLocation } from "../core/locations";
import { SourceLocation } from "../domain/model";

export type LinkedBreakpointState = "none" | "managed" | "external";

export class ManagedBreakpointService implements vscode.Disposable {
  private readonly managed = new Set<vscode.SourceBreakpoint>();
  private readonly disposables: vscode.Disposable[];

  public constructor() {
    this.disposables = [
      vscode.debug.onDidChangeBreakpoints((event) => {
        for (const breakpoint of event.removed) {
          if (breakpoint instanceof vscode.SourceBreakpoint) {
            this.managed.delete(breakpoint);
          }
        }
      }),
      vscode.debug.onDidTerminateDebugSession(() => this.clear()),
    ];
  }

  public state(location: SourceLocation): LinkedBreakpointState {
    if (this.managedBreakpointAt(location)) {
      return "managed";
    }
    return findSourceBreakpoint(location) ? "external" : "none";
  }

  public toggle(location: SourceLocation): LinkedBreakpointState {
    const managed = this.managedBreakpointAt(location);
    if (managed) {
      this.managed.delete(managed);
      vscode.debug.removeBreakpoints([managed]);
      return "none";
    }
    if (findSourceBreakpoint(location)) {
      return "external";
    }
    const breakpoint = new vscode.SourceBreakpoint(toVscodeLocation(location), true);
    this.managed.add(breakpoint);
    vscode.debug.addBreakpoints([breakpoint]);
    return "managed";
  }

  public clear(): void {
    const breakpoints = [...this.managed].filter((breakpoint) =>
      vscode.debug.breakpoints.includes(breakpoint),
    );
    this.managed.clear();
    if (breakpoints.length) {
      vscode.debug.removeBreakpoints(breakpoints);
    }
  }

  public dispose(): void {
    this.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private managedBreakpointAt(
    location: SourceLocation,
  ): vscode.SourceBreakpoint | undefined {
    return [...this.managed].find((breakpoint) =>
      breakpointMatchesLocation(breakpoint, location),
    );
  }
}

function findSourceBreakpoint(location: SourceLocation): vscode.SourceBreakpoint | undefined {
  return vscode.debug.breakpoints.find((breakpoint): breakpoint is vscode.SourceBreakpoint => {
    if (!(breakpoint instanceof vscode.SourceBreakpoint)) {
      return false;
    }
    return breakpointMatchesLocation(breakpoint, location);
  });
}

function breakpointMatchesLocation(
  breakpoint: vscode.SourceBreakpoint,
  location: SourceLocation,
): boolean {
  return (
    normalizePath(breakpoint.location.uri.fsPath) === normalizePath(location.path) &&
    breakpoint.location.range.start.line === Math.max(0, location.line - 1)
  );
}
