import * as path from "node:path";
import * as vscode from "vscode";
import { SessionStore } from "../core/sessionStore";
import { StackFrameSnapshot } from "../domain/model";

export class CallStackTree
  implements vscode.TreeDataProvider<StackFrameSnapshot>, vscode.Disposable
{
  private readonly changeEmitter = new vscode.EventEmitter<StackFrameSnapshot | undefined>();
  private readonly storeSubscription: vscode.Disposable;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(private readonly store: SessionStore) {
    this.storeSubscription = store.onDidChange(() => this.changeEmitter.fire(undefined));
  }

  public getChildren(): StackFrameSnapshot[] {
    const pause = this.store.selectedPause();
    return [...(pause?.frames ?? [])];
  }

  public getTreeItem(frame: StackFrameSnapshot): vscode.TreeItem {
    const label = frame.name;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    if (frame.location) {
      item.description = `${path.basename(frame.location.path)}:${frame.location.line}`;
      item.resourceUri = vscode.Uri.file(frame.location.path);
      item.command = {
        command: "codeCat.revealLocation",
        title: "Reveal stack frame",
        arguments: [frame.location, frame.id],
      };
    } else {
      item.description = "无源码";
    }
    item.iconPath = new vscode.ThemeIcon("symbol-method");
    item.contextValue = "codeCat.stackFrame";
    return item;
  }

  public dispose(): void {
    this.storeSubscription.dispose();
    this.changeEmitter.dispose();
  }
}
