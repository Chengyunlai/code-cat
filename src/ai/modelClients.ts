import * as vscode from "vscode";

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

const REQUEST_TIMEOUT_MS = 90_000;

export async function requestHttpModel(
  request: HttpModelRequest,
  token: vscode.CancellationToken,
): Promise<string> {
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
): Promise<string> {
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
    return direct.trim();
  }
  const output = readArray(payload, "output");
  const text = output
    .flatMap((item) => readArray(item, "content"))
    .flatMap((content) => {
      const value = readString(content, "text");
      return value ? [value] : [];
    })
    .join("");
  return requireModelText(text, "OpenAI Responses API");
}

async function requestOpenAiChat(
  request: HttpModelRequest,
  token: vscode.CancellationToken,
): Promise<string> {
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
  return requireModelText(typeof text === "string" ? text : "", "OpenAI-compatible API");
}

async function requestAnthropic(
  request: HttpModelRequest,
  token: vscode.CancellationToken,
): Promise<string> {
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
  return requireModelText(text, "Anthropic Messages API");
}

async function requestGemini(
  request: HttpModelRequest,
  token: vscode.CancellationToken,
): Promise<string> {
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
  return requireModelText(text, "Gemini generateContent API");
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
