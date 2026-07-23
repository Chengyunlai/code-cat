import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { ChatMessage, DebugPause, RouteNode, RoutePlan, TutorMessage } from "../domain/model";
import { PythonProjectIndex } from "../project/pythonProjectIndex";
import { refinePythonBreakpointLine } from "../project/pythonBreakpointLines";
import { ModelProviderService } from "./modelProviderService";

interface ModelRouteNode {
  readonly title?: unknown;
  readonly symbol?: unknown;
  readonly file?: unknown;
  readonly line?: unknown;
  readonly reason?: unknown;
  readonly confidence?: unknown;
}

interface ModelRoutePlan {
  readonly summary?: unknown;
  readonly nodes?: unknown;
}

interface ModelQuestionResponse extends ModelRoutePlan {
  readonly kind?: unknown;
  readonly message?: unknown;
}

interface ModelPauseExplanation {
  readonly whatHappened?: unknown;
  readonly whyItMatters?: unknown;
  readonly inspectNext?: unknown;
}

export type TutorQuestionResult =
  | { readonly kind: "chat"; readonly answer: string }
  | { readonly kind: "route"; readonly route: RoutePlan };

export type TutorGuidanceCode = "no-workspace" | "no-python-files";

const ROUTE_NODE_SCHEMA =
  '{"title":"...","symbol":"...","file":"relative/path.py","line":1,"reason":"...","confidence":"high|medium|low"}';
const PAUSE_EXPLANATION_SCHEMA =
  '{"whatHappened":"...","whyItMatters":"...","inspectNext":"..."}';
const MAX_CHAT_ANSWER_LENGTH = 8_000;
const MAX_ROUTE_SUMMARY_LENGTH = 1_200;
const MAX_ROUTE_NODE_TITLE_LENGTH = 120;
const MAX_ROUTE_NODE_SYMBOL_LENGTH = 200;
const MAX_ROUTE_NODE_REASON_LENGTH = 600;
const MAX_EXPLANATION_SECTION_LENGTH = 600;

export class TutorGuidanceError extends Error {
  public constructor(
    public readonly code: TutorGuidanceCode,
    message: string,
  ) {
    super(message);
    this.name = "TutorGuidanceError";
  }
}

export class AiTutor {
  public constructor(
    private readonly projectIndex: PythonProjectIndex,
    private readonly modelProvider: ModelProviderService,
  ) {}

  public async answerQuestion(
    question: string,
    conversation: readonly ChatMessage[],
    token: vscode.CancellationToken,
  ): Promise<TutorQuestionResult> {
    const immediateAnswer = immediateConversationAnswer(question);
    if (immediateAnswer) {
      return { kind: "chat", answer: immediateAnswer };
    }
    await this.ensureProjectReady();
    const projectContext = await this.projectIndex.promptContext(question);
    const recentConversation = conversation
      .slice(-8)
      .map((message) => `${message.role}: ${message.text.slice(0, 1_000)}`)
      .join("\n");
    const response = await this.request(
      [
        "You are Code Cat, a concise assistant inside a Python code-understanding tool.",
        "Decide whether the user wants normal conversation or a concrete code execution path.",
        "For greetings, thanks, general conversation, or product usage questions, return:",
        '{"kind":"chat","message":"your answer"}',
        "For questions about where or how behavior executes in this project, return:",
        `{"kind":"route","summary":"...","nodes":[${ROUTE_NODE_SCHEMA}]}`,
        ...routeInstructions(),
        "Answer in the user's language. Return JSON only, without Markdown fences.",
        "Do not invent project facts that are absent from the index.",
        "",
        recentConversation ? `Recent conversation:\n${recentConversation}\n` : "",
        `User message: ${question}`,
        "",
        projectContext,
      ].join("\n"),
      token,
    );
    let parsed: ModelQuestionResponse;
    try {
      parsed = JSON.parse(stripCodeFence(response)) as ModelQuestionResponse;
    } catch {
      if (response.trim()) {
        return { kind: "chat", answer: boundedModelText(response, MAX_CHAT_ANSWER_LENGTH) };
      }
      throw new Error(
        "模型没有返回可识别的回答。请重新提问；如果持续出现，请更换更适合代码分析的模型。",
      );
    }
    if (parsed.kind === "chat" && typeof parsed.message === "string" && parsed.message.trim()) {
      return {
        kind: "chat",
        answer: boundedModelText(parsed.message, MAX_CHAT_ANSWER_LENGTH),
      };
    }
    if (parsed.kind === "route" || Array.isArray(parsed.nodes)) {
      return { kind: "route", route: await this.parseRoute(question, parsed) };
    }
    throw new Error("模型返回了未知的回答类型，请重新提问。");
  }

  public async locateRoute(
    question: string,
    token: vscode.CancellationToken,
  ): Promise<RoutePlan> {
    await this.ensureProjectReady();
    const projectContext = await this.projectIndex.promptContext(question);
    const response = await this.request(
      [
        "You are a senior Python engineer planning a guided code-reading session.",
        "Infer the most likely end-to-end path related to the user's question.",
        "Return JSON only with this shape:",
        `{"summary":"...","nodes":[${ROUTE_NODE_SCHEMA}]}`,
        ...routeInstructions(),
        "Do not wrap JSON in Markdown fences.",
        "",
        `User question: ${question}`,
        "",
        projectContext,
      ].join("\n"),
      token,
    );
    return this.parseRouteResponse(question, response);
  }

  public async explainPause(
    question: string | undefined,
    pause: DebugPause,
    token: vscode.CancellationToken,
  ): Promise<TutorMessage> {
    const stack = pause.frames
      .map((frame, index) => {
        const location = frame.location
          ? `${frame.location.path}:${frame.location.line}`
          : "unknown source";
        return `${index}. ${frame.name} — ${location}`;
      })
      .join("\n");
    const variables = pause.variables
      .map((variable) => `${variable.name}: ${variable.type ?? "?"} = ${variable.value}`)
      .join("\n");
    const response = await this.request(
      [
        "You are a patient Python debugging tutor.",
        "Explain this real debugger pause with exactly this JSON shape:",
        PAUSE_EXPLANATION_SCHEMA,
        "Each field must contain 1-3 concise sentences in the learner's language.",
        "Use whatHappened for the current execution, whyItMatters for its role in the code path, and inspectNext for one concrete next observation.",
        "The current location and variable snapshot belong to the first stack frame. Treat later frames only as callers in the path.",
        "Do not claim facts that are not supported by the runtime snapshot.",
        "Do not include Markdown headings or fenced code blocks.",
        "Return JSON only, without Markdown fences.",
        "",
        `Learner's goal: ${question ?? "Understand the current execution path"}`,
        `Pause reason: ${pause.reason}`,
        "Call stack:",
        stack,
        "Top-frame variables:",
        variables || "No variables were captured.",
      ].join("\n"),
      token,
    );
    return {
      id: randomUUID(),
      kind: "pause",
      pauseId: pause.id,
      explanation: parsePauseExplanation(response),
    };
  }

  private async request(prompt: string, token: vscode.CancellationToken): Promise<string> {
    return this.modelProvider.request(prompt, token);
  }

  private async ensureProjectReady(): Promise<void> {
    const readinessIssue = await this.projectIndex.readinessIssue();
    if (readinessIssue) {
      throw new TutorGuidanceError(readinessIssue.kind, readinessIssue.message);
    }
  }

  private async parseRouteResponse(question: string, raw: string): Promise<RoutePlan> {
    let parsed: ModelRoutePlan;
    try {
      parsed = JSON.parse(stripCodeFence(raw)) as ModelRoutePlan;
    } catch {
      throw new Error(
        "模型没有返回可识别的代码路径。请重新提问；如果持续出现，请更换更适合代码分析的模型。",
      );
    }

    return this.parseRoute(question, parsed);
  }

  private async parseRoute(question: string, parsed: ModelRoutePlan): Promise<RoutePlan> {
    if (!Array.isArray(parsed.nodes)) {
      throw new Error("模型返回的代码路径缺少节点。请换一个更具体的问题后重试。");
    }

    const nodes: RouteNode[] = [];
    for (const candidate of parsed.nodes.slice(0, 8) as ModelRouteNode[]) {
      if (
        typeof candidate.title !== "string" ||
        typeof candidate.file !== "string" ||
        typeof candidate.line !== "number" ||
        typeof candidate.reason !== "string"
      ) {
        continue;
      }

      const absolutePath = await this.projectIndex.resolveFile(candidate.file);
      if (!absolutePath) {
        continue;
      }
      const document = await vscode.workspace.openTextDocument(absolutePath);
      const confidence =
        candidate.confidence === "high" ||
        candidate.confidence === "medium" ||
        candidate.confidence === "low"
          ? candidate.confidence
          : "low";
      const title = boundedModelText(candidate.title, MAX_ROUTE_NODE_TITLE_LENGTH);
      const reason = boundedModelText(candidate.reason, MAX_ROUTE_NODE_REASON_LENGTH);
      if (!title || !reason) {
        continue;
      }
      nodes.push({
        id: randomUUID(),
        title,
        symbol:
          typeof candidate.symbol === "string"
            ? boundedModelText(candidate.symbol, MAX_ROUTE_NODE_SYMBOL_LENGTH) || undefined
            : undefined,
        location: {
          path: absolutePath,
          line: refinePythonBreakpointLine(document, candidate.line),
          column: 1,
        },
        reason,
        confidence,
      });
    }

    if (nodes.length === 0) {
      throw new Error(
        "模型返回的路径无法映射到当前 Python 项目。请换一个更具体的问题；如果持续出现，请检查所选模型是否适合代码分析。",
      );
    }
    const modelSummary =
      typeof parsed.summary === "string"
        ? boundedModelText(parsed.summary, MAX_ROUTE_SUMMARY_LENGTH)
        : "";

    return {
      question,
      summary:
        modelSummary ||
        boundedModelText(
          `A ${nodes.length}-stop reading route for: ${question}`,
          MAX_ROUTE_SUMMARY_LENGTH,
        ),
      nodes,
    };
  }
}

function stripCodeFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/u, "")
    .replace(/\s*```$/u, "")
    .trim();
}

function parsePauseExplanation(raw: string): {
  readonly whatHappened: string;
  readonly whyItMatters: string;
  readonly inspectNext: string;
} {
  let parsed: ModelPauseExplanation;
  try {
    parsed = JSON.parse(stripCodeFence(raw)) as ModelPauseExplanation;
  } catch {
    throw new Error("模型没有按结构返回暂停解释，请重试或更换模型。");
  }
  return {
    whatHappened: explanationSection(parsed.whatHappened, "whatHappened"),
    whyItMatters: explanationSection(parsed.whyItMatters, "whyItMatters"),
    inspectNext: explanationSection(parsed.inspectNext, "inspectNext"),
  };
}

function explanationSection(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`模型返回的暂停解释缺少 ${field} 字段。`);
  }
  return boundedModelText(value, MAX_EXPLANATION_SECTION_LENGTH);
}

function boundedModelText(value: string, maximumLength: number): string {
  const normalized = value.replaceAll("\0", "").trim();
  return normalized.length <= maximumLength
    ? normalized
    : `${normalized.slice(0, maximumLength - 1)}…`;
}

function routeInstructions(): readonly string[] {
  return [
    "Use only files and symbols present in the supplied project index for route nodes.",
    "Prefer 2-8 high-value stops: entry boundary, orchestration, domain decision, I/O, and result.",
    "For each line, choose a precise executable statement such as a call, branch, state change, or return; do not use a def/class declaration, import, comment, or blank line unless unavoidable.",
    "Return one stop when the project is small.",
  ];
}

function immediateConversationAnswer(question: string): string | undefined {
  const normalized = question
    .trim()
    .replace(/[!！,.，。?？~～]+$/gu, "")
    .trim();
  if (/^(?:你好|您好|嗨|哈[喽罗囉]|hello|hi|hey)(?:呀|啊|哦|呢)?$/iu.test(normalized)) {
    return /^[a-z]/iu.test(normalized)
      ? "Hi! What would you like to explore?"
      : "你好！想聊聊什么？";
  }
  return undefined;
}
