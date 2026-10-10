import { useNavigate } from 'react-router'

import { ChevronLeftIcon } from '@/components/icons'
import { THEME, usePlan } from '@/lib/explorePlan'
import {
  ArrowDownIcon,
  CarLine,
  ChevronRightIcon,
  MetroIcon,
  PlaceThumb,
  TagChip,
  WalkIcon,
} from '@/screens/explore/parts'
import { useAskAgent, useSky } from '@/screens/explore/hooks'

/*
 * 對應設計稿 frame：Figma 536:1894 situational-3
 * （初步確定方向/figma/situational-3.png）
 *
 * 小行程的「行程預覽」：各站停留、可替換，以及「前往第一站，怎麼去？」。
 *
 * 跟稿不同的地方（都是因為店家是示意、沒有真的地址）：
 *   - 底部 CTA 稿上是「確認地點與交通」。我們沒辦法替示意店家確認地址，
 *     所以改成真的做得到的事：存進今天的行程，然後去行程頁。
 *   - 三種交通方式稿上看起來是選項。這裡直接是動作：yoxi 進叫車流程，
 *     捷運與步行交給 Agent 查真的路線（它查得到附近真實的店）。
 *   - 稿上這頁沒有 tab bar；tab bar 的顯示規則在 lib/layout，不在這次範圍內。
 */

export function PlanPreviewScreen() {
  const navigate = useNavigate()
  const sky = useSky()
  const plan = usePlan(sky.rainy)
  const ask = useAskAgent()

  const title = THEME.title(sky.rainy)
  const first = plan.stops[0]
  const place = sky.status === 'ready' ? sky.place : '目前位置'

  const modes = [
    {
      id: 'yoxi',
      name: 'yoxi',
      Icon: CarLine,
      body: `搭到${first.name}，減少雨中步行。`,
      badge: sky.rainy ? '雨天少走路推薦' : null,
      go: () => navigate('/ride/booking'),
    },
    {
      id: 'metro',
      name: '捷運',
      Icon: MetroIcon,
      body: '依站點與轉乘比較；出站步行量待確認。',
      badge: null,
      go: () => ask(`我在${place}，想去附近的${first.short}，搭捷運怎麼去比較少走路？`),
    },
    {
      id: 'walk',
      name: '步行',
      Icon: WalkIcon,
      body: '距離合適、雨勢允許時，也能慢慢走。',
      badge: null,
      go: () => ask(`我在${place}，走路可以到的${first.short}有哪些？`),
    },
  ]

  return (
    <div className="flex min-h-full shrink-0 flex-col bg-primary-tint-2">
      <div className="flex-1 px-5 pb-4 pt-2">
        <header className="flex items-center gap-2">
          <button
            type="button"
            /* 直接開這個網址時沒有上一頁，退回小行程頁而不是離開 App */
            onClick={() =>
              (window.history.state as { idx?: number } | null)?.idx
                ? navigate(-1)
                : navigate('/explore/plan')
            }
            aria-label="返回"
            className="-ml-2 flex h-11 w-11 items-center justify-center"
          >
            <ChevronLeftIcon />
          </button>
          <h1 className="text-[19px] font-bold">行程預覽</h1>
          <span className="text-[12px] text-subtle">示意行程</span>
        </header>

        <h2 className="mt-3 text-[22px] font-bold leading-snug">{title}</h2>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {THEME.tags.map((t) => (
            <TagChip key={t}>{t}</TagChip>
          ))}
        </div>

        {sky.status === 'ready' && (
          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            {sky.place}・{sky.temperature}°C{sky.condition}
            {sky.rainChance !== null && `・降雨${sky.rainChance}%`}・體感{sky.feelsLike}°C
            <br />
            天氣更新{sky.updated}
          </p>
        )}

        <div className="mt-3 rounded-xl bg-surface-3 px-3.5 py-3">
          <p className="text-[15px] font-bold">
            {plan.stops.length}站・規劃停留共{plan.stayMinutes}分鐘
          </p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            停留{plan.stops.map((s) => s.stayMinutes).join('＋')}分鐘；交通時間待位置確認。
            <br />
            目標{THEME.targetMinutes / 60}小時，
            {plan.stayMinutes > THEME.targetMinutes ? '光停留就已超過，建議縮短。' : '尚未確認是否可行。'}
          </p>
        </div>

        <ol className="mt-3">
          {plan.stops.map((s, i) => (
            <li key={s.id}>
              {i > 0 && (
                <div className="flex items-start gap-2.5 px-3 py-2 text-[12px] leading-relaxed text-subtle">
                  <ArrowDownIcon width={16} height={16} className="mt-0.5 shrink-0 text-primary" />
                  <p>
                    距離、步行量與時間待確認
                    <br />
                    區域內移動依距離與雨勢選擇，不必每站叫車。
                  </p>
                </div>
              )}
              <div className="flex gap-3 rounded-2xl border border-line/50 bg-surface p-2.5">
                <PlaceThumb kind={s.kind} className="h-[68px] w-[62px]" />
                <div className="min-w-0 flex-1 py-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[16px] font-bold">
                      {String(i + 1).padStart(2, '0')} {s.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => plan.replace(s.id)}
                      aria-label={`替換${s.name}`}
                      className="hit-area shrink-0 text-[13px] font-semibold text-primary"
                    >
                      替換
                    </button>
                  </div>
                  <p className="mt-1 text-[13px]">
                    規劃停留{s.stayMinutes}分鐘・{s.indoor ? '室內' : '戶外'}
                  </p>
                  <p className="mt-1 truncate text-[12px] text-muted">
                    {sky.status === 'ready' ? sky.place : '附近'}・地址與營業狀態待確認
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-2.5 flex items-center justify-between">
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

        <section className="mt-5" aria-labelledby="how-title">
          <h2 id="how-title" className="text-[18px] font-bold">
            前往第一站，怎麼去？
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            各方案時間與費用，確認出發位置與店址後估算。
            <br />
            目前尚未選擇交通或叫車。
          </p>

          <ul className="mt-3 space-y-2.5">
            {modes.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={m.go}
                  className={[
                    'flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-transform active:scale-[.99]',
                    m.badge ? 'bg-primary-tint' : 'bg-surface',
                  ].join(' ')}
                >
                  <m.Icon
                    width={26}
                    height={26}
                    className={m.id === 'yoxi' ? 'shrink-0 text-primary' : 'shrink-0 text-muted'}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-[16px] font-bold">{m.name}</span>
                      {m.badge && (
                        <span className="shrink-0 text-[12px] font-semibold text-primary">
                          {m.badge}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[13px] text-muted">{m.body}</span>
                  </span>
                  <ChevronRightIcon width={18} height={18} className="shrink-0 text-subtle" />
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-[12px] leading-relaxed text-muted">
            店內消費與交通費待確認。店家與照片為示意，
            並非已查證商家；確認地址與營業後再出發。
          </p>
          <div className="mt-2 flex items-center justify-between text-[13px] text-subtle">
            <span>結束後再決定</span>
            <button
              type="button"
              onClick={() => navigate('/ride/booking')}
              className="hit-area flex items-center gap-0.5"
            >
              回程叫車（可選）
              <ChevronRightIcon width={14} height={14} />
            </button>
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 z-10 border-t border-black/5 bg-surface px-5 pb-2.5 pt-3">
        <button
          type="button"
          onClick={() => {
            plan.save()
            navigate('/trips')
          }}
          className="w-full rounded-xl bg-primary py-3 text-[16px] font-bold text-white transition-transform active:scale-[.98]"
        >
          {plan.saved ? '更新今天的行程' : '加入今天的行程'}
        </button>
        <p className="mt-1.5 text-[12px] text-muted">
          店家地址仍待確認；加入後可在「行程」頁查看與調整。
        </p>
      </div>
    </div>
  )
}
