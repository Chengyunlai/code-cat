/**
 * 把提问转成可以拿去匹配源码符号的检索词。
 *
 * 只认拉丁字母开头的标识符。中文提问提取不到词不是错误，而是一个信号：
 * 「需要先把中文意图翻成候选标识符」。判断和决策留给调用点，这里只负责提取，
 * 让两端宿主与 core 共用同一份规则——三处各写一份正则迟早会漂移。
 */
const LATIN_IDENTIFIER_PATTERN = /[a-z_][a-z0-9_]{2,}/gu;

/**
 * @param hints 模型从非拉丁提问里扩展出的候选标识符。同样按标识符规则过滤，
 *   因此模型即使返回整句中文或带标点的短语，也不会污染检索词集合。
 */
export function extractRetrievalTerms(
  question: string,
  hints?: readonly string[],
): readonly string[] {
  const fromQuestion = question.toLowerCase().match(LATIN_IDENTIFIER_PATTERN) ?? [];
  const fromHints = (hints ?? []).flatMap(
    (hint) => hint.toLowerCase().match(LATIN_IDENTIFIER_PATTERN) ?? [],
  );
  return [...new Set([...fromQuestion, ...fromHints])];
}
