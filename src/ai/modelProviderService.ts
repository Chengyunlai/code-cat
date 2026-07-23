import * as vscode from "vscode";
import { HttpModelTransport, requestHttpModel } from "./modelClients";

export type ModelProviderId =
  | "vscode"
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "qwen"
  | "moonshot"
  | "zhipu"
  | "doubao"
  | "newapi"
  | "openaiCompatible";

interface ProviderDefinition {
  readonly id: ModelProviderId;
  readonly label: string;
  readonly description: string;
  readonly transport?: HttpModelTransport;
  readonly defaultBaseUrl?: string;
  readonly defaultModel?: string;
  readonly configurableBaseUrl?: boolean;
  readonly modelPlaceHolder?: string;
}

interface ResolvedProvider {
  readonly definition: ProviderDefinition;
  readonly baseUrl?: string;
  readonly model?: string;
}

export interface ModelProviderStatus {
  readonly id: ModelProviderId;
  readonly label: string;
  readonly detail?: string;
}

const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: "vscode",
    label: "VS Code 内置模型",
    description: "使用 VS Code Language Model API，无需在 Code Cat 中保存 Key",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "使用 OpenAI Responses API",
    transport: "openai-responses",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6-terra",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    description: "使用 Anthropic Messages API",
    transport: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-20250514",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    description: "使用 Gemini generateContent API",
    transport: "gemini",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-2.5-flash",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    description: "OpenAI 兼容接口",
    transport: "openai-chat",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
  },
  {
    id: "qwen",
    label: "通义千问 Qwen",
    description: "阿里云百炼 OpenAI 兼容接口",
    transport: "openai-chat",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
  },
  {
    id: "moonshot",
    label: "Moonshot / Kimi",
    description: "Moonshot OpenAI 兼容接口",
    transport: "openai-chat",
    defaultBaseUrl: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-8k",
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    description: "智谱 OpenAI 兼容接口",
    transport: "openai-chat",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-flash",
  },
  {
    id: "doubao",
    label: "豆包 / 火山方舟",
    description: "火山方舟 OpenAI 兼容接口，模型处填写推理接入点 ID",
    transport: "openai-chat",
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    modelPlaceHolder: "ep-xxxxxxxxxxxxxxxx",
  },
  {
    id: "newapi",
    label: "NewAPI",
    description: "填写你的 NewAPI 地址、令牌和渠道模型名",
    transport: "openai-chat",
    configurableBaseUrl: true,
    modelPlaceHolder: "例如 gpt-4.1-mini 或渠道模型名",
  },
  {
    id: "openaiCompatible",
    label: "其他 OpenAI 兼容服务",
    description: "适用于兼容 /chat/completions 的代理或自托管服务",
    transport: "openai-chat",
    configurableBaseUrl: true,
    modelPlaceHolder: "服务提供的模型名",
  },
] as const;

const PROVIDER_IDS = new Set<ModelProviderId>(PROVIDERS.map((provider) => provider.id));

export class ModelProviderService {
  public constructor(private readonly context: vscode.ExtensionContext) {}

  public status(): ModelProviderStatus {
    const provider = this.resolveCurrent();
    return {
      id: provider.definition.id,
      label: provider.definition.label,
      detail: provider.model,
    };
  }

  public async request(prompt: string, token: vscode.CancellationToken): Promise<string> {
    const provider = this.resolveCurrent();
    if (provider.definition.id === "vscode") {
      return requestVsCodeModel(prompt, token);
    }
    const apiKey = await this.context.secrets.get(secretName(provider.definition.id));
    if (!apiKey) {
      throw new Error(
        `${provider.definition.label} API Key has not been configured. Run “Code Cat: Configure Model Provider”.`,
      );
    }
    if (!provider.definition.transport || !provider.baseUrl || !provider.model) {
      throw new Error(
        `${provider.definition.label} configuration is incomplete. Run “Code Cat: Configure Model Provider”.`,
      );
    }
    return requestHttpModel(
      {
        transport: provider.definition.transport,
        baseUrl: normalizeBaseUrl(provider.baseUrl),
        model: provider.model,
        apiKey,
        prompt,
      },
      token,
    );
  }

  public async configure(): Promise<void> {
    const current = this.resolveCurrent();
    const picked = await vscode.window.showQuickPick(
      PROVIDERS.map((provider) => ({
        label: provider.label,
        description: provider.id === current.definition.id ? "当前使用" : undefined,
        detail: provider.description,
        provider,
      })),
      {
        title: "Code Cat：选择大模型服务",
        placeHolder: "API Key 会安全存入 VS Code SecretStorage",
        ignoreFocusOut: true,
      },
    );
    if (!picked) {
      return;
    }
    const provider = picked.provider;
    if (provider.id === "vscode") {
      await this.saveSelection(provider.id, "", "");
      void vscode.window.showInformationMessage("Code Cat 已切换到 VS Code 内置模型。");
      return;
    }

    let baseUrl = provider.defaultBaseUrl;
    if (provider.configurableBaseUrl) {
      const enteredBaseUrl = await vscode.window.showInputBox({
        title: `${provider.label}：Base URL`,
        prompt: "填写 API 根地址，通常以 /v1 结尾；不要填写 /chat/completions",
        placeHolder:
          provider.id === "newapi"
            ? "https://newapi.example.com/v1"
            : "https://api.example.com/v1",
        value: provider.id === current.definition.id ? current.baseUrl : undefined,
        ignoreFocusOut: true,
        validateInput: validateBaseUrlInput,
      });
      if (enteredBaseUrl === undefined) {
        return;
      }
      baseUrl = normalizeBaseUrl(enteredBaseUrl);
    }

    const model = await vscode.window.showInputBox({
      title: `${provider.label}：模型`,
      prompt:
        provider.id === "doubao"
          ? "填写火山方舟推理接入点 ID"
          : "填写该厂商或 NewAPI 渠道实际开放的模型名",
      placeHolder: provider.modelPlaceHolder ?? provider.defaultModel,
      value:
        provider.id === current.definition.id
          ? current.model
          : provider.defaultModel,
      ignoreFocusOut: true,
      validateInput: (value) => (value.trim() ? undefined : "请输入模型名"),
    });
    if (model === undefined) {
      return;
    }

    const storedKey = await this.context.secrets.get(secretName(provider.id));
    const enteredKey = await vscode.window.showInputBox({
      title: `${provider.label}：API Key`,
      prompt: storedKey
        ? "已保存过 Key；留空可继续使用，输入新值则覆盖"
        : "Key 只存入 VS Code SecretStorage，不会写入项目或 settings.json",
      placeHolder: storedKey ? "留空以保留已保存的 Key" : "粘贴 API Key",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) =>
        value.trim() || storedKey ? undefined : "请输入 API Key",
    });
    if (enteredKey === undefined) {
      return;
    }
    const apiKey = enteredKey.trim() || storedKey;
    if (!apiKey || !baseUrl) {
      return;
    }

    await this.context.secrets.store(secretName(provider.id), apiKey);
    await this.saveSelection(provider.id, model.trim(), baseUrl);
    const action = await vscode.window.showInformationMessage(
      `已配置 ${provider.label} · ${model.trim()}。`,
      "测试连接",
    );
    if (action === "测试连接") {
      await vscode.commands.executeCommand("codeCat.testModelProvider");
    }
  }

  public async testCurrent(): Promise<void> {
    const status = this.status();
    const answer = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Code Cat 正在测试 ${status.label}`,
        cancellable: true,
      },
      async (_progress, token) => this.request("Reply with exactly: OK", token),
    );
    void vscode.window.showInformationMessage(
      `模型连接成功：${status.label}${status.detail ? ` · ${status.detail}` : ""}（${answer.slice(0, 40)}）`,
    );
  }

  public async clearCurrentApiKey(): Promise<void> {
    const provider = this.resolveCurrent().definition;
    if (provider.id === "vscode") {
      void vscode.window.showInformationMessage("VS Code 内置模型不需要 Code Cat API Key。");
      return;
    }
    await this.context.secrets.delete(secretName(provider.id));
    void vscode.window.showInformationMessage(`已删除 ${provider.label} 的本地 API Key。`);
  }

  private resolveCurrent(): ResolvedProvider {
    const configuration = vscode.workspace.getConfiguration("codeCat.ai");
    const configuredId = configuration.get<string>("provider", "vscode");
    const id = isProviderId(configuredId) ? configuredId : "vscode";
    const definition = PROVIDERS.find((provider) => provider.id === id) ?? PROVIDERS[0]!;
    const configuredModel = configuration.get<string>("model", "").trim();
    const configuredBaseUrl = configuration.get<string>("baseUrl", "").trim();
    return {
      definition,
      model: configuredModel || definition.defaultModel,
      baseUrl: definition.configurableBaseUrl
        ? configuredBaseUrl || undefined
        : definition.defaultBaseUrl,
    };
  }

  private async saveSelection(
    provider: ModelProviderId,
    model: string,
    baseUrl: string,
  ): Promise<void> {
    const configuration = vscode.workspace.getConfiguration("codeCat.ai");
    await Promise.all([
      configuration.update("provider", provider, vscode.ConfigurationTarget.Global),
      configuration.update("model", model, vscode.ConfigurationTarget.Global),
      configuration.update("baseUrl", baseUrl, vscode.ConfigurationTarget.Global),
    ]);
  }
}

async function requestVsCodeModel(
  prompt: string,
  token: vscode.CancellationToken,
): Promise<string> {
  const models = await vscode.lm.selectChatModels();
  const model = models[0];
  if (!model) {
    throw new Error(
      "No VS Code language model is available. Configure an API provider or sign in to a compatible VS Code model provider.",
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

function isProviderId(value: string): value is ModelProviderId {
  return PROVIDER_IDS.has(value as ModelProviderId);
}

function secretName(provider: ModelProviderId): string {
  return `codeCat.modelProvider.apiKey.${provider}`;
}

function validateBaseUrlInput(value: string): string | undefined {
  try {
    normalizeBaseUrl(value);
    return undefined;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("请输入 Base URL");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Base URL 格式不正确");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Base URL 不能包含账号、查询参数或片段");
  }
  const localHost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localHost)) {
    throw new Error("为防止 Key 泄露，请使用 HTTPS；本机 localhost 可使用 HTTP");
  }
  return parsed.toString().replace(/\/+$/u, "");
}
