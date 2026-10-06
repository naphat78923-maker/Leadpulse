// How a next action will be carried out, read from its wording ("Call chef about the test").
// Only for picking a row icon: an unclear action returns null and shows no icon.

export type ActionChannel = 'call' | 'email' | 'message' | 'meeting';

const PATTERNS: [ActionChannel, RegExp][] = [
  ['email', /\b(e-?mail|mail)\b|อีเมล/i],
  ['call', /\b(call|phone|ring)\b|โทร/i],
  ['message', /\b(line|dm|message|msg|text|whatsapp|chat|ig|instagram)\b|ไลน์|แชท|ข้อความ/i],
  ['meeting', /\b(meet|meeting|visit|tasting|demo)\b|นัด|เข้าพบ/i],
];

export function actionChannel(text: string | null | undefined): ActionChannel | null {
  if (!text) return null;
  // The earliest mention wins: "Call, then email the quote" is a call.
  let best: { channel: ActionChannel; at: number } | null = null;
  for (const [channel, pattern] of PATTERNS) {
    const at = text.search(pattern);
    if (at >= 0 && (!best || at < best.at)) best = { channel, at };
  }
  return best?.channel ?? null;
}
