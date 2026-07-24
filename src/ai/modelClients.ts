import * as vscode from "vscode";
import { estimateTokenUsage, ModelClientResponse } from "./tokenUsage";

export type HttpModelTransport =
  | "openai-responses"
  | "openai-chat"
  | "anthropic"
  | "gemini";

export interface HttpModelRequest {
  readonly transport: HttpModelTransport;
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly prompt: string;
  readonly timeoutMs?: number;
}

interface ReportedUsageFields {
  readonly input: string;
  readonly output: string;
  readonly total: string;
  readonly cacheReadTokens?: number;
}

const REQUEST_TIMEOUT_MS = 90_000;

export async function requestHttpModel(
  request: HttpModelRequest,
  token: vscode.CancellationToken,
): Promise<ModelClientResponse> {
  switch (request.transport) {
    case "openai-responses":
      return requestOpenAiResponses(request, token);
    case "openai-chat":
      return requestOpenAiChat(request, token);
    case "anthropic":
      return requestAnthropic(request, token);
    case "gemini":
      return requestGemini(request, token);
  }
}

async function requestOpenAiResponses(
  request: HttpModelRequest,
  token: vscode.CancellationToken,
): Promise<ModelClientResponse> {
  const payload = await postJson(
    joinUrl(request.baseUrl, "responses"),
    {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    {
      model: request.model,
      input: request.prompt,
      store: false,
    },
    token,
    request.timeoutMs,
  );
  const direct = readString(payload, "output_text");
  if (direct) {
    return {
      text: direct.trim(),
      usage:
        readOpenAiResponsesUsage(payload) ?? estimateTokenUsage(request.prompt, direct.trim()),
    };
  }
  const output = readArray(payload, "output");
  const text = output
    .flatMap((item) => readArray(item, "content"))
    .flatMap((content) => {
      const value = readString(content, "text");
      return value ? [value] : [];
    })
    .join("");
  const normalizedText = requireModelText(text, "OpenAI Responses API");
  return {
    text: normalizedText,
    usage:
      readOpenAiResponsesUsage(payload) ?? estimateTokenUsage(request.prompt, normalizedText),
  };
}

function readOpenAiResponsesUsage(payload: unknown): ModelClientResponse["usage"] | undefined {
  const usage = readObject(readObject(payload)?.usage);
  const inputDetails = readObject(usage?.input_tokens_details);
  return readStandardReportedUsage(usage, {
    input: "input_tokens",
    output: "output_tokens",
    total: "total_tokens",
    cacheReadTokens: readNumber(inputDetails, "cached_tokens") ?? 0,
  });
}

async function requestOpenAiChat(
  request: HttpModelRequest,
  token: vscode.CancellationToken,
): Promise<ModelClientResponse> {
  const payload = await postJson(
    joinUrl(request.baseUrl, "chat/completions"),
    {
      Authorization: `Bearer ${request.apiKey}`,
      "Content-Type": "application/json",
    },
    {
      model: request.model,
      messages: [{ role: "user", content: request.prompt }],
      stream: false,
    },
    token,
    request.timeoutMs,
  );
  const firstChoice = readArray(payload, "choices")[0];
  const message = readObject(firstChoice)?.message;
  const text = readObject(message)?.content;
  const normalizedText = requireModelText(
    typeof text === "string" ? text : "",
    "OpenAI-compatible API",
  );
  return {
    text: normalizedText,
    usage: readOpenAiChatUsage(payload) ?? estimateTokenUsage(request.prompt, normalizedText),
  };
}

function readOpenAiChatUsage(payload: unknown): ModelClientResponse["usage"] | undefined {
  const usage = readObject(readObject(payload)?.usage);
  const promptDetails = readObject(usage?.prompt_tokens_details);
  return readStandardReportedUsage(usage, {
    input: "prompt_tokens",
    output: "completion_tokens",
    total: "total_tokens",
    cacheReadTokens: readNumber(promptDetails, "cached_tokens") ?? 0,
  });
}

async function requestAnthropic(
  request: HttpModelRequest,
  token: vscode.CancellationToken,
): Promise<ModelClientResponse> {
  const payload = await postJson(
    joinUrl(request.baseUrl, "messages"),
    {
      "x-api-key": request.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    {
      model: request.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: request.prompt }],
    },
    token,
    request.timeoutMs,
  );
  const text = readArray(payload, "content")
    .flatMap((part) => {
      const value = readString(part, "text");
      return value ? [value] : [];
    })
    .join("");
  const normalizedText = requireModelText(text, "Anthropic Messages API");
  return {
    text: normalizedText,
    usage: readAnthropicUsage(payload) ?? estimateTokenUsage(request.prompt, normalizedText),
  };
}

function readAnthropicUsage(payload: unknown): ModelClientResponse["usage"] | undefined {
  const usage = readObject(readObject(payload)?.usage);
  const reportedInputTokens = readNumber(usage, "input_tokens");
  const reportedOutputTokens = readNumber(usage, "output_tokens");
  const reportedCacheReadTokens = readNumber(usage, "cache_read_input_tokens");
  const reportedCacheWriteTokens = readNumber(usage, "cache_creation_input_tokens");
  if (
    reportedInputTokens === undefined &&
    reportedOutputTokens === undefined &&
    reportedCacheReadTokens === undefined &&
    reportedCacheWriteTokens === undefined
  ) {
    return undefined;
  }
  const uncachedInputTokens = reportedInputTokens ?? 0;
  const outputTokens = reportedOutputTokens ?? 0;
  const cacheReadTokens = reportedCacheReadTokens ?? 0;
  const cacheWriteTokens = reportedCacheWriteTokens ?? 0;
  const inputTokens = uncachedInputTokens + cacheReadTokens + cacheWriteTokens;
  return {
    source: "reported",
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
  };
}

async function requestGemini(
  request: HttpModelRequest,
  token: vscode.CancellationToken,
): Promise<ModelClientResponse> {
  const model = encodeURIComponent(request.model);
  const payload = await postJson(
    joinUrl(request.baseUrl, `models/${model}:generateContent`),
    {
      "x-goog-api-key": request.apiKey,
      "Content-Type": "application/json",
    },
    {
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      generationConfig: { maxOutputTokens: 4096 },
    },
    token,
    request.timeoutMs,
  );
  const firstCandidate = readArray(payload, "candidates")[0];
  const content = readObject(firstCandidate)?.content;
  const text = readArray(content, "parts")
    .flatMap((part) => {
      const value = readString(part, "text");
      return value ? [value] : [];
    })
    .join("");
  const normalizedText = requireModelText(text, "Gemini generateContent API");
  return {
    text: normalizedText,
    usage: readGeminiUsage(payload) ?? estimateTokenUsage(request.prompt, normalizedText),
  };
}

function readGeminiUsage(payload: unknown): ModelClientResponse["usage"] | undefined {
  const usage = readObject(readObject(payload)?.usageMetadata);
  return readStandardReportedUsage(usage, {
    input: "promptTokenCount",
    output: "candidatesTokenCount",
    total: "totalTokenCount",
    cacheReadTokens: readNumber(usage, "cachedContentTokenCount") ?? 0,
  });
}

function readStandardReportedUsage(
  usage: Record<string, unknown> | undefined,
  fields: ReportedUsageFields,
): ModelClientResponse["usage"] | undefined {
  const reportedInputTokens = readNumber(usage, fields.input);
  const reportedOutputTokens = readNumber(usage, fields.output);
  const reportedTotalTokens = readNumber(usage, fields.total);
  if (
    reportedInputTokens === undefined &&
    reportedOutputTokens === undefined &&
    reportedTotalTokens === undefined
  ) {
    return undefined;
  }
  const inputTokens = reportedInputTokens ?? 0;
  const outputTokens = reportedOutputTokens ?? 0;
  return {
    source: "reported",
    inputTokens,
    outputTokens,
    totalTokens: reportedTotalTokens ?? inputTokens + outputTokens,
    cacheReadTokens: fields.cacheReadTokens ?? 0,
    cacheWriteTokens: 0,
  };
}

async function postJson(
  url: string,
  headers: Readonly<Record<string, string>>,
  body: unknown,
  token: vscode.CancellationToken,
  requestedTimeoutMs?: number,
): Promise<unknown> {
  if (token.isCancellationRequested) {
    throw new vscode.CancellationError();
  }
  const controller = new AbortController();
  const cancellation = token.onCancellationRequested(() => controller.abort());
  const timeoutMs = requestedTimeoutMs
    ? Math.max(1, Math.floor(requestedTimeoutMs))
    : REQUEST_TIMEOUT_MS;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: "error",
    });
    const raw = await response.text();
    const payload = parseJson(raw);
    if (!response.ok) {
      throw new Error(formatProviderError(response.status, payload));
    }
    if (payload === undefined) {
      throw new Error("The model provider returned a non-JSON response.");
    }
    return payload;
  } catch (error) {
    if (token.isCancellationRequested) {
      throw new vscode.CancellationError();
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`The model provider request timed out after ${timeoutMs} ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    cancellation.dispose();
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}/${path.replace(/^\/+/, "")}`;
}

function parseJson(raw: string): unknown {
  if (!raw.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function formatProviderError(status: number, payload: unknown): string {
  const object = readObject(payload);
  const nestedError = readObject(object?.error);
  const providerMessage =
    readString(nestedError, "message") ??
    (typeof object?.error === "string" ? object.error : undefined) ??
    readString(object, "message");
  const hint =
    status === 401 || status === 403
      ? " Check the API key and provider permissions."
      : status === 404
        ? " Check the Base URL and model name."
        : "";
  const safeMessage = providerMessage?.slice(0, 600);
  return `Model provider request failed (${status})${safeMessage ? `: ${safeMessage}` : "."}${hint}`;
}

function requireModelText(value: string, provider: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${provider} returned no text content.`);
  }
  return trimmed;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readArray(value: unknown, key: string): readonly unknown[] {
  const candidate = readObject(value)?.[key];
  return Array.isArray(candidate) ? candidate : [];
}

function readString(value: unknown, key: string): string | undefined {
  const candidate = readObject(value)?.[key];
  return typeof candidate === "string" ? candidate : undefined;
}

function readNumber(value: unknown, key: string): number | undefined {
  const candidate = readObject(value)?.[key];
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0
    ? candidate
    : undefined;
}
