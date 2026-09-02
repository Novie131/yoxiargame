import { stepCountIs, streamText, type ModelMessage } from 'ai'

import { agentModel, modelChain } from './model.ts'
import { tools } from './tools.ts'

/*
 * 領域介面。server 只認得這裡，不認得 AI SDK。
 */

const SYSTEM = `你是 yoxi 的行動助理，服務對象是台灣使用者。

語言規則：
- 一律使用繁體中文，並使用台灣用語（捷運不是地鐵、叫車不是打車、機車不是摩托車）。
- 語氣親切自然，像朋友在聊天，可以適度使用驚嘆號，但不要浮誇。
- 回覆簡潔，一般三到四句話以內。

行為規則：
- 需要即時資訊（天氣、路況、車資、活動）時務必呼叫工具，不要憑空編造數字。
- 拿到工具結果後，用自然的口語轉述，不要直接貼 JSON。
- 主動提供有幫助的建議，例如下雨時建議改搭計程車、紫外線高時提醒防曬。
- 若使用者的需求需要叫車，說明預估時間與車資後再詢問是否要叫車。`

export type ChatMessage = ModelMessage

/*
 * NIM 會間歇回 503 Service temporarily overloaded（實測連續兩次都 503，
 * 第三次才成功），所以重試次數要比預設的 2 次高。
 * AI SDK 會做指數退避，不需要自己實作。
 */
const MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 5)

/*
 * 這是 reasoning 模型 —— 回一句話就可能燒掉數百個 token 在推理上。
 * max_tokens 給太小會讓推理被截斷並洩漏進回覆內容。
 */
const MAX_OUTPUT_TOKENS = Number(process.env.LLM_MAX_OUTPUT_TOKENS ?? 8000)

/*
 * 注意：streamText 不會對串流中途的錯誤拋例外，只會呼叫 onError。
 * 若不接這個回呼，NIM 的 503 會讓串流無聲中斷、回傳空字串，
 * 呼叫端的 try/catch 完全攔不到，看起來就像模型什麼都沒回。
 */
export function streamAgentReply(
  messages: ChatMessage[],
  onError?: (error: unknown) => void,
) {
  return streamText({
    model: agentModel(),
    system: SYSTEM,
    messages,
    tools,
    // 允許模型呼叫工具後再回一輪，最多五步避免無限迴圈
    stopWhen: stepCountIs(5),
    maxRetries: MAX_RETRIES,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    onError: ({ error }) => {
      console.error('[agent] 串流錯誤：', error instanceof Error ? error.message : error)
      onError?.(error)
    },
  })
}

/*
 * 帶 fallback 的串流。
 *
 * NIM 過載時會回 503 打斷串流，而 streamText 對這種錯誤不拋例外，
 * 只呼叫 onError —— 串流會無聲結束。這裡的策略是：
 *
 *   還沒吐出任何文字就失敗 → 換下一個模型重試（使用者看不出來）
 *   已經吐出文字才失敗     → 不重試（不能把送出去的字收回來），
 *                            改以拋出錯誤讓呼叫端決定怎麼處理
 *
 * 產出純文字片段，呼叫端串接即可。
 */
export async function* streamAgentReplyWithFallback(
  messages: ChatMessage[],
): AsyncGenerator<string, void, unknown> {
  const chain = modelChain()
  let lastError: unknown

  for (const [index, modelId] of chain.entries()) {
    let streamError: unknown
    let emitted = false

    const result = streamText({
      model: agentModel(modelId),
      system: SYSTEM,
      messages,
      tools,
      stopWhen: stepCountIs(5),
      maxRetries: MAX_RETRIES,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      onError: ({ error }) => {
        streamError = error
      },
    })

    try {
      for await (const chunk of result.textStream) {
        emitted = true
        yield chunk
      }
    } catch (error) {
      streamError = error
    }

    if (!streamError && emitted) return

    lastError = streamError ?? new Error('回覆為空')
    const message = lastError instanceof Error ? lastError.message : String(lastError)

    if (emitted) {
      // 已經送出部分內容，換模型只會讓回覆前後不連貫
      console.error(`[agent] ${modelId} 串流中斷（已輸出部分內容）：${message}`)
      throw lastError
    }

    const next = chain[index + 1]
    console.error(
      next
        ? `[agent] ${modelId} 失敗（${message}），改用 ${next}`
        : `[agent] ${modelId} 失敗（${message}），已無備援模型`,
    )
  }

  throw lastError ?? new Error('所有模型都失敗')
}
