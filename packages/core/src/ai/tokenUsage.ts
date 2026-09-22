export interface TokenCounts {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

export interface TokenUsage extends TokenCounts {
  readonly source: "reported" | "estimated";
}

export interface ModelClientResponse {
  readonly text: string;
  readonly usage: TokenUsage;
  readonly model?: string;
}

export interface TokenUsageTotals {
  readonly reported: TokenCounts;
  readonly estimated: TokenCounts;
}

export type ModelRequestKind = "question" | "route" | "pause" | "connection-test";

export interface ModelUsageRecord {
  readonly requestKind: ModelRequestKind;
  readonly provider: string;
  readonly model?: string;
  readonly recordedAt: string;
  readonly usage: TokenUsage;
}

export interface TokenUsageSnapshot {
  readonly last?: ModelUsageRecord;
  readonly session: TokenUsageTotals;
  readonly project: TokenUsageTotals;
}

const CJK_CHARACTER_PATTERN = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u;

export function estimateTokenUsage(input: string, output: string): TokenUsage {
  const inputTokens = estimateTextTokenCount(input);
  const outputTokens = estimateTextTokenCount(output);
  return {
    source: "estimated",
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

function estimateTextTokenCount(value: string): number {
  let cjkCharacters = 0;
  let otherCharacters = 0;
  for (const character of value) {
    if (CJK_CHARACTER_PATTERN.test(character)) {
      cjkCharacters += 1;
    } else {
      otherCharacters += 1;
    }
  }
  return cjkCharacters + Math.ceil(otherCharacters / 4);
}
