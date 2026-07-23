import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { ChatMessage, DebugPause, RouteNode, RoutePlan, TutorMessage } from "../domain/model";
import { PythonProjectIndex } from "../project/pythonProjectIndex";
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

export type TutorQuestionResult =
  | { readonly kind: "chat"; readonly answer: string }
  | { readonly kind: "route"; readonly route: RoutePlan };

export type TutorGuidanceCode = "no-workspace" | "no-python-files";

const ROUTE_NODE_SCHEMA =
  '{"title":"...","symbol":"...","file":"relative/path.py","line":1,"reason":"...","confidence":"high|medium|low"}';

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
        return { kind: "chat", answer: response.trim() };
      }
      throw new Error(
        "模型没有返回可识别的回答。请重新提问；如果持续出现，请更换更适合代码分析的模型。",
      );
    }
    if (parsed.kind === "chat" && typeof parsed.message === "string" && parsed.message.trim()) {
      return { kind: "chat", answer: parsed.message.trim() };
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
    const markdown = await this.request(
      [
        "You are a patient Python debugging tutor.",
        "Explain this real debugger pause using three short sections:",
        "1. What is happening now",
        "2. Why this stack and these values matter",
        "3. What the learner should observe next",
        "Do not claim facts that are not supported by the runtime snapshot.",
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
    return { id: randomUUID(), kind: "pause", markdown, pauseId: pause.id };
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
      nodes.push({
        id: randomUUID(),
        title: candidate.title,
        symbol: typeof candidate.symbol === "string" ? candidate.symbol : undefined,
        location: {
          path: absolutePath,
          line: Math.min(document.lineCount, Math.max(1, Math.floor(candidate.line))),
          column: 1,
        },
        reason: candidate.reason,
        confidence,
      });
    }

    if (nodes.length === 0) {
      throw new Error(
        "模型返回的路径无法映射到当前 Python 项目。请换一个更具体的问题；如果持续出现，请检查所选模型是否适合代码分析。",
      );
    }

    return {
      question,
      summary:
        typeof parsed.summary === "string"
          ? parsed.summary
          : `A ${nodes.length}-stop reading route for: ${question}`,
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

function routeInstructions(): readonly string[] {
  return [
    "Use only files and symbols present in the supplied project index for route nodes.",
    "Prefer 2-8 high-value stops: entry boundary, orchestration, domain decision, I/O, and result.",
    "Return one stop when the project is small.",
  ];
}
