import type { ChatMessage } from './index.ts'

/*
 * 使用者輸入的驗證與清洗。
 *
 * 這一層擋的是三件事：
 *   1. 資源濫用 —— 超長訊息或超多輪對話，一次請求就能燒掉大量 token
 *   2. 角色偽造 —— 前端可以送任意 JSON，若允許 role: 'system' 就等於
 *                  讓使用者直接改寫系統指令，這是最直接的 prompt injection
 *   3. 隱形字元 —— 用零寬字元或雙向控制字元把指令藏在看似正常的文字裡，
 *                  畫面上看到的與模型讀到的不一致
 *
 * 語意層面的防護（用話術誘導模型違反規則）在 system prompt 處理。
 * 兩層都需要，任一層單獨都不夠。
 */

const MAX_MESSAGES = 40
const MAX_CHARS_PER_MESSAGE = 4000
const MAX_TOTAL_CHARS = 24000

const TAB = 0x09
const LINE_FEED = 0x0a
const CARRIAGE_RETURN = 0x0d

/*
 * 判斷是否為應該移除的字元。
 * 刻意用 code point 判斷而非正則字面量 —— 把這些字元直接寫進原始碼，
 * 在編輯器與 code review 裡同樣是隱形的，反而危險。
 */
function isUnsafeChar(code: number): boolean {
  // 保留換行與 tab，其餘 C0 控制字元移除
  if (code === TAB || code === LINE_FEED || code === CARRIAGE_RETURN) return false
  if (code <= 0x1f) return true
  // DEL 與 C1 控制字元
  if (code >= 0x7f && code <= 0x9f) return true
  // 零寬字元與雙向文字控制字元（ZWSP、ZWNJ、ZWJ、LRM、RLM、LRE…RLO）
  if (code >= 0x200b && code <= 0x200f) return true
  if (code >= 0x202a && code <= 0x202e) return true
  // word joiner 與隱形數學運算子
  if (code >= 0x2060 && code <= 0x2064) return true
  // 雙向文字隔離控制字元
  if (code >= 0x2066 && code <= 0x2069) return true
  // BOM / zero width no-break space
  if (code === 0xfeff) return true
  return false
}

function stripUnsafeChars(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (code !== undefined && isUnsafeChar(code)) continue
    out += ch
  }
  return out
}

export type SanitizeResult =
  | { ok: true; messages: ChatMessage[] }
  | { ok: false; error: string }

export function sanitizeMessages(input: unknown): SanitizeResult {
  if (!Array.isArray(input) || input.length === 0) {
    return { ok: false, error: 'messages 為必填，且不可為空陣列' }
  }
  if (input.length > MAX_MESSAGES) {
    return { ok: false, error: `對話輪數過多，上限為 ${MAX_MESSAGES} 則` }
  }

  const messages: ChatMessage[] = []
  let total = 0

  for (const raw of input) {
    if (typeof raw !== 'object' || raw === null) {
      return { ok: false, error: 'messages 內容格式錯誤' }
    }

    const { role, content } = raw as { role?: unknown; content?: unknown }

    /*
     * 只接受 user 與 assistant。
     * 不接受 system —— 系統指令只能由伺服器端決定，允許前端傳入
     * 等同於把改寫規則的權限交給使用者。
     * 也不接受 tool —— 工具結果只能由本服務自己產生，
     * 否則使用者可以偽造「查詢結果」讓模型據以回答。
     */
    if (role !== 'user' && role !== 'assistant') {
      return { ok: false, error: 'role 只接受 user 或 assistant' }
    }
    if (typeof content !== 'string') {
      return { ok: false, error: 'content 必須是字串' }
    }

    const cleaned = stripUnsafeChars(content).trim()

    if (!cleaned) continue
    if (cleaned.length > MAX_CHARS_PER_MESSAGE) {
      return { ok: false, error: `單則訊息過長，上限為 ${MAX_CHARS_PER_MESSAGE} 字` }
    }

    total += cleaned.length
    if (total > MAX_TOTAL_CHARS) {
      return { ok: false, error: `對話總長度超過上限 ${MAX_TOTAL_CHARS} 字` }
    }

    messages.push({ role, content: cleaned })
  }

  if (messages.length === 0) {
    return { ok: false, error: '沒有有效的訊息內容' }
  }
  if (messages[messages.length - 1].role !== 'user') {
    return { ok: false, error: '最後一則訊息必須來自使用者' }
  }

  return { ok: true, messages }
}
