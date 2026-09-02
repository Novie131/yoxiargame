/*
 * 台灣用語 / 繁體中文品質檢測
 *
 * 對 Agent 送出一組貼近實際使用情境的對話，自動檢查回覆有沒有：
 *   1. 簡體字
 *   2. 中國用語（地鐵、打車、視頻…）
 *   3. 工具呼叫是否正確觸發
 * 並量測首字延遲與總延遲。
 *
 * 用法：npm run lang-check
 * 換模型只要改 .env 的 NVIDIA_MODEL，再跑一次就能比較。
 */

import { streamAgentReply, type ChatMessage } from '../src/agent/index.ts'
import { providerName } from '../src/agent/model.ts'

// ── 檢測規則 ────────────────────────────────────────────

/* 只收「簡體專有」的字，繁簡同形的一律不列，避免誤判 */
const SIMPLIFIED = new Set(
  ('们个这说时会对应学实现发经过电话车门问间关开长马鸟见觉认识语请谢让边达远进运连迟选适' +
   '带头买卖东西丽点热无爱国图书报纸样机气动务员级红绿线纪约级终结给续经统计设备两个还' +
   '际预测价买单双变换转输赢难题际专业务农业产权责历险检验证据环境济营养卫生医药疗' +
   '张陈刘杨黄赵吴钱孙').split('')
)

/* 中國用語 → 台灣用語。key 用正則，涵蓋繁簡兩種寫法 */
const MAINLAND_TERMS: Array<[RegExp, string, string]> = [
  [/地[铁鐵]/g,      '地鐵',   '捷運'],
  [/打[车車]/g,      '打車',   '叫車'],
  [/出租[车車]/g,    '出租車', '計程車'],
  [/公交/g,          '公交',   '公車'],
  [/[视視][频頻]/g,  '視頻',   '影片'],
  [/[质質]量/g,      '質量',   '品質'],
  [/[软軟]件/g,      '軟件',   '軟體'],
  [/[网網][络絡]/g,  '網絡',   '網路'],
  [/摩托[车車]/g,    '摩托車', '機車'],
  [/屏幕/g,          '屏幕',   '螢幕'],
  [/激活/g,          '激活',   '啟用'],
  [/默[认認]/g,      '默認',   '預設'],
  [/信息/g,          '信息',   '訊息'],
  [/[台臺]湾/g,      '台湾',   '台灣'],
]

// ── 測試案例 ────────────────────────────────────────────

type Case = { name: string; prompt: string; expectTool?: string }

const CASES: Case[] = [
  {
    name: '通勤路線設定',
    prompt: '我每天從板橋站搭捷運到市政府站上班，幫我設定通勤路線',
    expectTool: 'save_commute_route',
  },
  { name: '天氣查詢', prompt: '今天信義區天氣如何？需要帶傘嗎？', expectTool: 'get_weather' },
  { name: '捷運狀況', prompt: '板南線現在正常嗎？', expectTool: 'get_transit_status' },
  { name: '叫車估價', prompt: '從大安區到松山機場叫車大概多少錢？', expectTool: 'estimate_ride' },
  { name: '活動推薦', prompt: '大安森林公園附近今天有什麼寶可夢活動？', expectTool: 'search_activities' },
  {
    name: '誘導用語陷阱',
    prompt: '我想搭大眾運輸去公司，順便問一下手機螢幕上顯示的資訊準嗎？',
  },
]

// ── 執行 ────────────────────────────────────────────────

type Result = {
  name: string
  text: string
  toolsCalled: string[]
  ttfbMs: number
  totalMs: number
  simplified: string[]
  mainland: Array<[string, string]>
  error?: string
}

/* NIM 會間歇回 503 打斷串流，同一個案例最多重試這麼多次 */
const CASE_RETRIES = 3

async function attempt(c: Case) {
  const messages: ChatMessage[] = [{ role: 'user', content: c.prompt }]
  const started = Date.now()
  let ttfb = 0
  let text = ''
  const toolsCalled: string[] = []
  let streamError: unknown

  const result = streamAgentReply(messages, (e) => { streamError = e })

  for await (const chunk of result.textStream) {
    if (!ttfb) ttfb = Date.now() - started
    text += chunk
  }
  for (const step of await result.steps) {
    for (const call of step.toolCalls) toolsCalled.push(call.toolName)
  }

  return { text, toolsCalled, ttfb, totalMs: Date.now() - started, streamError }
}

async function runCase(c: Case): Promise<Result> {
  let last: Awaited<ReturnType<typeof attempt>> | undefined
  let error: string | undefined
  const started = Date.now()

  for (let i = 0; i < CASE_RETRIES; i++) {
    try {
      last = await attempt(c)
      // 空回覆通常代表串流被 503 中斷，重試
      if (last.text.trim() && !last.streamError) { error = undefined; break }
      error = last.streamError
        ? `串流錯誤：${last.streamError instanceof Error ? last.streamError.message : String(last.streamError)}`
        : '回覆為空（串流可能中斷）'
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  }

  if (!last || error) {
    return {
      name: c.name, text: last?.text ?? '', toolsCalled: last?.toolsCalled ?? [],
      ttfbMs: last?.ttfb ?? 0, totalMs: Date.now() - started,
      simplified: [], mainland: [], error,
    }
  }

  const { text, toolsCalled, ttfb, totalMs } = last

  const simplified = [...new Set([...text].filter((ch) => SIMPLIFIED.has(ch)))]
  const mainland: Array<[string, string]> = []
  for (const [re, wrong, right] of MAINLAND_TERMS) {
    if (re.test(text)) mainland.push([wrong, right])
    re.lastIndex = 0
  }

  return { name: c.name, text, toolsCalled, ttfbMs: ttfb, totalMs, simplified, mainland }
}

const model = process.env.NVIDIA_MODEL ?? process.env.LOCAL_MODEL ?? process.env.ANTHROPIC_MODEL ?? '?'
console.log(`\nprovider: ${providerName()}\nmodel:    ${model}\n`)
console.log('─'.repeat(72))

const results: Result[] = []
for (const c of CASES) {
  process.stdout.write(`  ${c.name} ... `)
  const r = await runCase(c)
  results.push(r)
  console.log(r.error ? '失敗' : `${r.totalMs} ms`)
}

console.log('─'.repeat(72))

let issues = 0
for (const [i, r] of results.entries()) {
  const expected = CASES[i].expectTool
  console.log(`\n▸ ${r.name}`)
  if (r.error) {
    console.log(`   ✗ 錯誤：${r.error}`)
    issues++
    continue
  }
  console.log(`   回覆：${r.text.replace(/\s+/g, ' ').slice(0, 110)}${r.text.length > 110 ? '…' : ''}`)
  console.log(`   延遲：首字 ${r.ttfbMs} ms／總計 ${r.totalMs} ms`)

  if (expected) {
    const hit = r.toolsCalled.includes(expected)
    console.log(`   工具：${hit ? `✓ ${expected}` : `✗ 未呼叫 ${expected}（實際：${r.toolsCalled.join(', ') || '無'}）`}`)
    if (!hit) issues++
  } else if (r.toolsCalled.length) {
    console.log(`   工具：${r.toolsCalled.join(', ')}`)
  }

  if (r.simplified.length) {
    console.log(`   ✗ 簡體字：${r.simplified.join(' ')}`)
    issues++
  }
  if (r.mainland.length) {
    for (const [wrong, right] of r.mainland) console.log(`   ✗ 中國用語：「${wrong}」應為「${right}」`)
    issues += r.mainland.length
  }
  if (!r.simplified.length && !r.mainland.length) console.log('   ✓ 用語檢查通過')
}

const ok = results.filter((r) => !r.error)
const avg = ok.length ? Math.round(ok.reduce((s, r) => s + r.totalMs, 0) / ok.length) : 0
const avgTtfb = ok.length ? Math.round(ok.reduce((s, r) => s + r.ttfbMs, 0) / ok.length) : 0

console.log('\n' + '─'.repeat(72))
console.log(`  案例 ${results.length}｜成功 ${ok.length}｜問題 ${issues}`)
console.log(`  平均延遲：首字 ${avgTtfb} ms／總計 ${avg} ms`)
console.log('─'.repeat(72) + '\n')

process.exitCode = issues > 0 ? 1 : 0
