import * as vscode from "vscode";
import { ModelUsageRecord, TokenCounts, TokenUsageSnapshot } from "../ai/tokenUsage";
import { TokenUsageTracker } from "../ai/tokenUsageTracker";

export interface TokenUsageStatusDiagnostics {
  readonly visible: boolean;
  readonly text: string;
}

export class TokenUsageStatusBar implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    90,
  );
  private readonly subscription: vscode.Disposable;
  private visible = false;

  public constructor(private readonly tracker: TokenUsageTracker) {
    this.item.name = "Code Cat Model Usage";
    this.item.command = "codeCat.showTokenUsage";
    this.subscription = tracker.onDidChange((snapshot) => this.render(snapshot));
    this.render(tracker.snapshot());
  }

  public diagnostics(): TokenUsageStatusDiagnostics {
    return { visible: this.visible, text: this.item.text };
  }

  public async showDetails(): Promise<void> {
    const snapshot = this.tracker.snapshot();
    if (!hasUsage(snapshot)) {
      void vscode.window.showInformationMessage(
        "Code Cat 还没有产生模型用量。发送一次模型问题后，统计会显示在状态栏。",
      );
      return;
    }
    const selection = await vscode.window.showQuickPick(
      usageItems(snapshot),
      {
        title: "Code Cat · 模型用量",
        placeHolder: "厂商报告与本地估算分开统计；估算不等同于账单",
      },
    );
    if (selection?.action === "reset") {
      await vscode.commands.executeCommand("codeCat.resetProjectTokenUsage");
    }
  }

  public dispose(): void {
    this.subscription.dispose();
    this.item.dispose();
  }

  private render(snapshot: TokenUsageSnapshot): void {
    const total = combinedTotal(snapshot.project);
    this.item.text = `$(pulse) ${compactTokenCount(total)}`;
    this.item.tooltip = usageTooltip(snapshot);
    this.visible = total > 0;
    if (this.visible) {
      this.item.show();
    } else {
      this.item.hide();
    }
  }
}

interface UsageQuickPickItem extends vscode.QuickPickItem {
  readonly action?: "reset";
}

function usageItems(snapshot: TokenUsageSnapshot): readonly UsageQuickPickItem[] {
  const items: UsageQuickPickItem[] = [];
  if (snapshot.last) {
    items.push({
      label: `$(history) 最近一次 · ${requestKindLabel(snapshot.last)}`,
      description: usageSourceLabel(snapshot.last.usage.source),
      detail: `${modelLabel(snapshot.last)} · ${countsLabel(snapshot.last.usage)}`,
    });
  }
  items.push(
    scopeItem("当前会话", snapshot.session),
    scopeItem("当前项目", snapshot.project),
    {
      label: "$(trash) 重置项目累计",
      description: "只清除 Code Cat 本地统计",
      action: "reset",
    },
  );
  return items;
}

function scopeItem(
  label: string,
  totals: TokenUsageSnapshot["session"],
): UsageQuickPickItem {
  return {
    label: `$(graph) ${label}`,
    description: `${compactTokenCount(combinedTotal(totals))} tokens`,
    detail:
      `厂商报告 ${countsLabel(totals.reported)} · ` +
      `本地估算 ${countsLabel(totals.estimated)}`,
  };
}

function usageTooltip(snapshot: TokenUsageSnapshot): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.appendMarkdown("**Code Cat 模型用量**\n\n");
  if (snapshot.last) {
    tooltip.appendMarkdown(
      `最近一次：${requestKindLabel(snapshot.last)} · ` +
        `${usageSourceLabel(snapshot.last.usage.source)} · ` +
        `${countsLabel(snapshot.last.usage)}\n\n`,
    );
  }
  tooltip.appendMarkdown(
    `当前会话：${compactTokenCount(combinedTotal(snapshot.session))} tokens\n\n`,
  );
  tooltip.appendMarkdown(
    `当前项目：${compactTokenCount(combinedTotal(snapshot.project))} tokens\n\n`,
  );
  tooltip.appendMarkdown("点击查看报告值、估算值和缓存明细。");
  return tooltip;
}

function hasUsage(snapshot: TokenUsageSnapshot): boolean {
  return (
    snapshot.last !== undefined ||
    combinedTotal(snapshot.session) > 0 ||
    combinedTotal(snapshot.project) > 0
  );
}

function combinedTotal(totals: TokenUsageSnapshot["session"]): number {
  return totals.reported.totalTokens + totals.estimated.totalTokens;
}

function countsLabel(counts: TokenCounts): string {
  const base =
    `输入 ${compactTokenCount(counts.inputTokens)} · ` +
    `输出 ${compactTokenCount(counts.outputTokens)} · ` +
    `总计 ${compactTokenCount(counts.totalTokens)}`;
  if (counts.cacheReadTokens === 0 && counts.cacheWriteTokens === 0) {
    return base;
  }
  return (
    `${base} · 缓存读 ${compactTokenCount(counts.cacheReadTokens)} · ` +
    `缓存写 ${compactTokenCount(counts.cacheWriteTokens)}`
  );
}

function compactTokenCount(value: number): string {
  return new Intl.NumberFormat("zh-CN", {
    notation: value >= 1_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

function modelLabel(record: ModelUsageRecord): string {
  return record.model ? `${record.provider} · ${record.model}` : record.provider;
}

function requestKindLabel(record: ModelUsageRecord): string {
  switch (record.requestKind) {
    case "route":
      return "路径定位";
    case "pause":
      return "暂停解释";
    case "connection-test":
      return "连接测试";
    case "question":
      return "问题回答";
  }
}

function usageSourceLabel(source: ModelUsageRecord["usage"]["source"]): string {
  return source === "reported" ? "厂商报告" : "本地估算";
}
