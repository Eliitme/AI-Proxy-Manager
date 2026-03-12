/**
 * Background Task Detector — heuristic classification of non-interactive requests.
 *
 * A request is classified as a background task if ANY of:
 *   1. x-background-task: true header is present
 *   2. User-Agent matches known CI/bot patterns
 *   3. First user message > 2000 chars AND stream !== true
 *   4. body.metadata.task_type === 'background'
 */

const BOT_UA_PATTERNS = [/\bCI\b/, /GitHub-Actions/i, /headless/i, /\bbot\b/i, /\bscript\b/i];
const LONG_MSG_THRESHOLD = 2000;

/**
 * Detect if a request should be treated as a background task.
 *
 * @param {Request} request  — Next.js/Web Request object (for headers)
 * @param {Object}  body     — parsed request body
 * @returns {boolean}
 */
export function isBackgroundTask(request, body) {
  // 1. Explicit header flag
  if (request?.headers?.get("x-background-task") === "true") return true;

  // 2. User-Agent heuristic
  const ua = request?.headers?.get("user-agent") || "";
  if (BOT_UA_PATTERNS.some(p => p.test(ua))) return true;

  // 3. Long non-streaming message
  if (!body?.stream) {
    const messages = body?.messages;
    if (Array.isArray(messages)) {
      const firstUser = messages.find(m => m.role === "user");
      const content = firstUser?.content;
      const text = typeof content === "string"
        ? content
        : Array.isArray(content)
          ? content.map(c => c.text || "").join("")
          : "";
      if (text.length > LONG_MSG_THRESHOLD) return true;
    }
  }

  // 4. Explicit metadata flag
  if (body?.metadata?.task_type === "background") return true;

  return false;
}
