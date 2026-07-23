import { randomUUID } from "node:crypto";
import * as vscode from "vscode";
import { DebugPause, RouteNode, RoutePlan, TutorMessage } from "../domain/model";
import { PythonProjectIndex } from "../project/pythonProjectIndex";

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

export class AiTutor {
  public constructor(private readonly projectIndex: PythonProjectIndex) {}

  public async locateRoute(
    question: string,
    token: vscode.CancellationToken,
  ): Promise<RoutePlan> {
    const projectContext = await this.projectIndex.promptContext(question);
    const response = await this.request(
      [
        "You are a senior Python engineer planning a guided code-reading session.",
        "Use only files and symbols present in the supplied project index.",
        "Infer the most likely end-to-end path related to the user's question.",
        "Prefer 3-8 high-value stops: entry boundary, orchestration, domain decision, I/O, and result.",
        "Return JSON only with this shape:",
        '{"summary":"...","nodes":[{"title":"...","symbol":"...","file":"relative/path.py","line":1,"reason":"...","confidence":"high|medium|low"}]}',
        "Do not wrap JSON in Markdown fences.",
        "",
        `User question: ${question}`,
        "",
        projectContext,
      ].join("\n"),
      token,
    );
    return this.parseRoute(question, response);
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
    const models = await vscode.lm.selectChatModels();
    const model = models[0];
    if (!model) {
      throw new Error(
        "No VS Code language model is available. Sign in to a compatible model provider, then retry.",
      );
    }

    const response = await model.sendRequest(
      [vscode.LanguageModelChatMessage.User(prompt)],
      {},
      token,
    );
    let result = "";
    for await (const fragment of response.text) {
      result += fragment;
    }
    return result.trim();
  }

  private async parseRoute(question: string, raw: string): Promise<RoutePlan> {
    let parsed: ModelRoutePlan;
    try {
      parsed = JSON.parse(stripCodeFence(raw)) as ModelRoutePlan;
    } catch {
      throw new Error("The language model did not return a valid route plan.");
    }

    if (!Array.isArray(parsed.nodes)) {
      throw new Error("The language model returned a route plan without nodes.");
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

    if (nodes.length < 3) {
      throw new Error(
        "The proposed route did not resolve to at least three Python stops in this workspace.",
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
