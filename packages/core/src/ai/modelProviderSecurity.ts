import { createHash } from "node:crypto";

export function modelProviderSecretName(provider: string, baseUrl: string): string {
  const endpointId = createHash("sha256")
    .update(normalizeModelBaseUrl(baseUrl))
    .digest("hex")
    .slice(0, 24);
  return `codeCat.modelProvider.apiKey.${provider}.${endpointId}`;
}

export function normalizeModelBaseUrl(value: string): string {
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
  if (/\/chat\/completions\/?$/u.test(parsed.pathname)) {
    throw new Error("Base URL 请填写 API 根地址，不要包含 /chat/completions");
  }
  const localHost =
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "[::1]" ||
    parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && localHost)) {
    throw new Error("为防止 Key 泄露，请使用 HTTPS；本机 localhost 可使用 HTTP");
  }
  return parsed.toString().replace(/\/+$/u, "");
}
