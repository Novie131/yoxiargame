import { stepCountIs, streamText, type ModelMessage } from 'ai'

import { agentModel } from './model.ts'
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

export function streamAgentReply(messages: ChatMessage[]) {
  return streamText({
    model: agentModel(),
    system: SYSTEM,
    messages,
    tools,
    // 允許模型呼叫工具後再回一輪，最多五步避免無限迴圈
    stopWhen: stepCountIs(5),
  })
}
