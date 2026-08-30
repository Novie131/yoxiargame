import { anthropic } from '@ai-sdk/anthropic'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

/*
 * 唯一一個認識 AI SDK 的檔案。
 * 換 provider、換 SDK、改走 gateway，都只動這裡，上層的 agent/ 與 server 不受影響。
 */

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`缺少環境變數 ${name}，請參考 apps/api/.env.example`)
  return value
}

export function agentModel(): LanguageModel {
  const provider = process.env.LLM_PROVIDER ?? 'nvidia'

  if (provider === 'anthropic') {
    return anthropic(process.env.ANTHROPIC_MODEL ?? 'claude-opus-5')
  }

  if (provider === 'nvidia') {
    const nvidia = createOpenAICompatible({
      name: 'nvidia',
      baseURL: process.env.NVIDIA_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
      apiKey: required('NVIDIA_API_KEY'),
    })
    return nvidia(required('NVIDIA_MODEL'))
  }

  throw new Error(`未知的 LLM_PROVIDER：${provider}（可用：nvidia、anthropic）`)
}
