/** Decode only the user-facing string in an incomplete JSON envelope. Never expose raw JSON. */
export function partialAnswer(raw: string): string {
  const field = /"(?:message|summary)"\s*:\s*"/u.exec(raw);
  if (!field) return "";
  const start = field.index + field[0].length;
  let encoded = "";
  for (let i = start; i < raw.length; i += 1) {
    const character = raw[i];
    if (character === '"') break;
    if (character === "\\") {
      const next = raw[i + 1];
      if (!next) break;
      if (next === "u") {
        if (!/^[0-9a-f]{4}$/iu.test(raw.slice(i + 2, i + 6))) break;
        encoded += raw.slice(i, i + 6);
        i += 5;
      } else {
        encoded += raw.slice(i, i + 2);
        i += 1;
      }
    } else encoded += character;
  }
  try { return (JSON.parse('"' + encoded + '"') as string).slice(0, 8000); }
  catch { return ""; }
}
