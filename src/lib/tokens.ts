const CJK_PATTERN =
  /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g;

/**
 * Approximate token count. Provider tokenizers are not shipped for local models,
 * so budgets are sized against an estimate: CJK characters cost ~1 token each and
 * other text averages ~4 characters per token.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkMatches = text.match(CJK_PATTERN);
  const cjkCount = cjkMatches ? cjkMatches.length : 0;
  const otherCount = text.length - cjkCount;
  return Math.ceil(cjkCount + otherCount / 4);
}

export function estimateMessagesTokens(
  messages: { role: string; content: string }[],
): number {
  return messages.reduce(
    (total, message) => total + estimateTokens(message.content) + estimateTokens(message.role) + 4,
    0,
  );
}
