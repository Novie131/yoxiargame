import { anthropic } from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

/*
 * 唯一一個認識 AI SDK 的檔案。
 * 換 provider、換 SDK、改走 gateway，都只動這裡，上層的 agent/ 與 server 不受影響。
 *
 * 三種 provider：
 *   nvidia    NVIDIA NIM 代管服務，需 API key
 *   local     地端推論（Ollama / LM Studio / llama.cpp），不需 key
 *   anthropic Claude，需 API key
 *
 * nvidia 與 local 都是 OpenAI 相容端點，差別只在 baseURL 與要不要金鑰。
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`缺少環境變數 ${name}，請參考 apps/api/.env.example`)
  return value
}

export type ProviderName = 'nvidia' | 'local' | 'anthropic'

export function providerName(): ProviderName {
  const value = (process.env.LLM_PROVIDER ?? 'nvidia') as ProviderName
  if (!['nvidia', 'local', 'anthropic'].includes(value)) {
    throw new Error(`未知的 LLM_PROVIDER：${value}（可用：nvidia、local、anthropic）`)
  }
  return value
}

/*
 * 建立指定 model id 的實例。fallback 機制需要在同一個 provider 下
 * 換不同的模型，所以 model id 要能從外部指定。
 */
export function agentModel(modelId?: string): LanguageModel {
  switch (providerName()) {
    case 'anthropic':
      return anthropic(modelId ?? process.env.ANTHROPIC_MODEL ?? 'claude-opus-5')

    case 'nvidia': {
      const nvidia = createOpenAICompatible({
        name: 'nvidia',
        baseURL: process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
        apiKey: required('NVIDIA_API_KEY'),
      })
      return nvidia(modelId ?? required('NVIDIA_MODEL'))
    }

    case 'local': {
      /*
       * 地端不需要金鑰，但有些伺服器仍要求 Authorization 標頭存在，
       * 所以給一個佔位字串。
       * 預設指向 Ollama；LM Studio 是 http://localhost:1234/v1，
       * llama.cpp 的 llama-server 是 http://localhost:8080/v1。
       */
      const local = createOpenAICompatible({
        name: 'local',
        baseURL: process.env.LOCAL_BASE_URL ?? 'http://localhost:11434/v1',
        apiKey: process.env.LOCAL_API_KEY ?? 'not-needed',
      })
      return local(modelId ?? required('LOCAL_MODEL'))
    }
  }
}

/*
 * 主模型與備援模型。
 *
 * 實測（npm run lang-check，各 6 個案例）：
 *   nemotron-3-super-120b-a12b    快（中位數 3.6s）但 4/6 成功，503 頻繁
 *   nemotron-3.5-lightning-30b    穩（6/6）但慢（中位數 9.2s）
 *
 * 所以主模型用快的，失敗才退到穩的 —— 大多數請求享受低延遲，
 * 遇到 NIM 過載時也不會直接失敗。
 */
export function modelChain(): string[] {
  const primary = process.env.NVIDIA_MODEL ?? process.env.LOCAL_MODEL ?? process.env.ANTHROPIC_MODEL
  const fallback = process.env.LLM_FALLBACK_MODEL
  return [primary, fallback].filter((m): m is string => Boolean(m))
}
