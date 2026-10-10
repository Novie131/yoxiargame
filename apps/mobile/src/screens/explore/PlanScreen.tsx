import { useRef } from 'react'
import { useNavigate } from 'react-router'

import { greeting } from '@/lib/datetime'
import { THEME, usePlan } from '@/lib/explorePlan'
import { useMember } from '@/lib/member'
import {
  ArrowDownIcon,
  HeroPlaceholder,
  PlaceIcon,
  PromptBar,
  SparkleIcon,
  TagChip,
  WeatherBadge,
  WeatherLines,
} from '@/screens/explore/parts'
import { useAskAgent, useSky } from '@/screens/explore/hooks'

/*
 * 對應設計稿 frame：Figma 536:1791 situational-2
 * （初步確定方向/figma/situational-2.png）
 *
 * 探索頁按「查看行程」之後的情境小行程：為使用者寫一段「今天怎麼過」，
 * 列出選好的幾站，再往下一步「行程預覽」（536:1894）。
 *
 * 站點跟著探索頁選的走（lib/explorePlan），不是寫死兩站。
 * 店家是示意，畫面照稿標明；底部的「說說你想怎麼調整」交給 Agent。
 */

const ORDINAL = (i: number) => String(i + 1).padStart(2, '0')

export function PlanScreen() {
  const navigate = useNavigate()
  const { displayName } = useMember()
  const sky = useSky()
  const plan = usePlan(sky.rainy)
  const ask = useAskAgent()
  const inputRef = useRef<HTMLInputElement>(null)

  const [first, second, ...rest] = plan.stops
  const story =
    `先${first.verb}` +
    (second ? `，再${second.verb}` : '') +
    (rest.length > 0 ? `，最後${rest[rest.length - 1].verb}` : '') +
    '。'

  const title = THEME.title(sky.rainy)

  return (
    <div className="flex min-h-full shrink-0 flex-col bg-primary-tint-2">
      <div className="flex-1 px-5 pb-4 pt-3">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[24px] font-bold leading-tight tracking-tight">
              {greeting()}，{displayName}
            </h1>
            <WeatherLines sky={sky} />
          </div>
          <WeatherBadge sky={sky} />
        </header>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {THEME.tags.map((t) => (
            <TagChip key={t}>{t}</TagChip>
          ))}
          {/* 要怎麼調整用講的最快：把游標帶到底下的輸入列 */}
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            className="hit-area px-1 text-[13px] font-semibold text-primary"
          >
            調整
          </button>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-[13px] font-semibold text-primary">
          <SparkleIcon width={18} height={18} />
          為{displayName}安排的慢時光
        </p>
        <h2 className="mt-1.5 text-[21px] font-bold leading-snug">
          {sky.rainy ? '今天有雨，去室內放鬆一下吧。' : '今天慢一點，去室內放鬆一下吧。'}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {story}
          <br />
          以室內停留為主，移動時再選少走路的方式。
        </p>

        <HeroPlaceholder className="mt-4 h-[160px]" />

        <h3 className="mt-4 text-[20px] font-bold">{title}</h3>

        <ol className="mt-3">
          {plan.stops.map((s, i) => (
            <li key={s.id}>
              {i > 0 && (
                <p className="flex items-center gap-3 py-2 pl-3 text-[12px] text-subtle">
                  <ArrowDownIcon width={16} height={16} className="text-muted" />
                  站間距離、步行量與交通時間待確認
                </p>
              )}
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-tint text-primary">
                  <PlaceIcon kind={s.kind} size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[16px] font-bold">
                      {ORDINAL(i)} {s.name}
                    </p>
                    <span className="shrink-0 text-[13px] text-subtle">{s.stayMinutes}分鐘</span>
                  </div>
                  <p className="mt-0.5 text-[13px] text-muted">{s.detail}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-4 rounded-xl bg-surface-3 px-3.5 py-3">
          <p className="text-[13px] font-semibold">
            規劃停留共{plan.stayMinutes}分鐘；目標{THEME.targetMinutes / 60}小時，交通另計。
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            店家與照片為示意，地址與營業狀態待確認。
            <br />
            確認位置後再評估{THEME.targetMinutes / 60}小時是否可行。
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/explore/plan/preview')}
          className="mt-4 w-full rounded-xl bg-primary py-3 text-[16px] font-bold text-white transition-transform active:scale-[.98]"
        >
          查看行程
        </button>
        <div className="mt-2.5 flex items-center justify-between">
          {/* 換哪一站、換成什麼，回探索頁的清單挑最直接 */}
          <button
            type="button"
            onClick={() => navigate('/explore#nearby')}
            className="hit-area text-[14px] font-semibold text-primary"
          >
            換一個停留點
          </button>
          <button
            type="button"
            onClick={plan.shorten}
            disabled={!plan.canShorten}
            className="hit-area text-[14px] font-semibold text-primary disabled:text-subtle"
          >
            縮短行程
          </button>
        </div>
      </div>

      <PromptBar
        leading="keyboard"
        placeholder="說說你想怎麼調整…"
        inputRef={inputRef}
        onSubmit={(text) =>
          ask(
            `關於我的小行程「${title}」（${plan.stops.map((s) => s.name).join(' → ')}）：${text}`,
          )
        }
      />
    </div>
  )
}
