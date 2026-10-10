import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'

import { MissionSheet } from '@/components/MissionSheet'
import { CATEGORIES, PLACES, THEME, usePlan, type Category } from '@/lib/explorePlan'
import { useUserLocation } from '@/lib/location'
import { useNearbyMissions } from '@/lib/missions'
import {
  CheckIcon,
  HeroPlaceholder,
  PlaceThumb,
  PromptBar,
  TagChip,
  WeatherBadge,
  WeatherLines,
} from '@/screens/explore/parts'
import { useAskAgent, useSky } from '@/screens/explore/hooks'

/*
 * 對應設計稿 frame：Figma 536:1672 explore-v2-situational-1
 * （初步確定方向/figma/explore-v2-situational-1.png）
 *
 * 結構照稿：標題＋天氣 → 分類 chips → 情境小行程大卡 → 附近靈感清單 → 底部搜尋列。
 *
 * 什麼是真的、什麼是示意：
 *   天氣列        真的（/weather，跟首頁同一份快取）
 *   分類 chips    真的篩選下面的清單
 *   小行程與清單  店家是示意（設計稿自己也標「示意景點」），資料在 lib/explorePlan
 *   加入行程      真的存進今天的行程（lib/trips），/trips 看得到
 *   搜尋／麥克風  交給首頁的 Agent 對話
 *
 * 舊版（地圖＋任務＋社群日）已經被這張稿取代。唯一保留的是任務深連結：
 * 對話卡與通知會導到 /explore?mission=<id>&lat=&lon=，那條路不能斷，
 * 所以帶著參數進來時照樣打開任務面板（見 MissionFromLink）。
 */

export function ExploreScreen() {
  const navigate = useNavigate()
  const { hash } = useLocation()
  const [params, setParams] = useSearchParams()
  const sky = useSky()
  const plan = usePlan(sky.rainy)
  const ask = useAskAgent()

  /* 設計稿預設選「室內」；再按一次同一顆就是全部 */
  const [category, setCategory] = useState<Category | null>('室內')
  const shown = category ? PLACES.filter((p) => p.categories.includes(category)) : PLACES

  /* 剛加進去的那一站，清單下面給一行回饋與去行程頁的連結 */
  const [justAdded, setJustAdded] = useState<string | null>(null)

  /*
   * 小行程頁的「換一個停留點」會導到 /explore#nearby，要直接捲到清單。
   * 外層捲動的是 AppShell 的 main，scrollIntoView 會找到它。
   */
  const nearbyRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (hash === '#nearby') nearbyRef.current?.scrollIntoView({ block: 'start' })
  }, [hash])

  const missionId = params.get('mission')

  return (
    /*
     * shrink-0：外層 main 是 flex 欄，min-h-full 會蓋掉 flex 子項預設的 min-height: auto，
     * 不加的話這層會被壓回一個螢幕高，底色在捲動後中途斷掉（TripsScreen 踩過同一個坑）。
     */
    <div className="flex min-h-full shrink-0 flex-col bg-primary-tint-2">
      <div className="flex-1 px-5 pb-4 pt-3">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[24px] font-bold leading-tight tracking-tight">探索，今天去哪裡？</h1>
            <WeatherLines sky={sky} />
          </div>
          <WeatherBadge sky={sky} />
        </header>

        {/*
          * 分類：篩選下面的「附近靈感」。
          * 稿上六顆排成一列；窄螢幕放不下時這一列自己橫向滑，不折行、也不撐寬整頁。
          */}
        <div
          className="-mx-5 mt-3 flex gap-1.5 overflow-x-auto px-5 py-1 [scrollbar-width:none]"
          role="group"
          aria-label="分類"
        >
          {CATEGORIES.map((c) => {
            const on = c === category
            return (
              <button
                key={c}
                type="button"
                aria-pressed={on}
                onClick={() => setCategory(on ? null : c)}
                className={[
                  'shrink-0 rounded-full border px-2.5 py-1 text-[13px] transition-colors',
                  on
                    ? 'border-primary bg-primary text-white'
                    : 'border-line/70 bg-surface text-ink',
                ].join(' ')}
              >
                {c}
              </button>
            )
          })}
        </div>

        {/* ── 情境小行程 ── */}
        <section className="mt-5" aria-labelledby="theme-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="theme-title" className="text-[18px] font-bold">
              {sky.rainy ? '雨天也值得出門' : '想待在室內的時候'}
            </h2>
            {/* 目前只有一個主題，「更多」交給 Agent 依今天的天氣推薦 */}
            <button
              type="button"
              onClick={() =>
                ask(
                  sky.rainy
                    ? '今天下雨，附近還有什麼適合的室內小行程主題？'
                    : '今天附近有什麼適合的小行程主題？',
                )
              }
              className="hit-area shrink-0 text-[13px] text-primary"
            >
              更多主題 ›
            </button>
          </div>

          <article className="mt-2.5 rounded-2xl border border-line/50 bg-surface p-3">
            <HeroPlaceholder className="h-[118px]" />
            <h3 className="mt-3 text-[20px] font-bold leading-snug">{THEME.title(sky.rainy)}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {THEME.tags.map((t) => (
                <TagChip key={t}>{t}</TagChip>
              ))}
            </div>
            <p className="mt-3 text-[15px] font-semibold">
              {plan.stops.map((s) => s.name).join(' → ')}
            </p>
            <p className="mt-2 text-[13px] text-muted">
              {plan.stops.length}站・規劃停留{plan.stayMinutes}分鐘（
              {plan.stops.map((s) => `${s.short}${s.stayMinutes}`).join('＋')}）
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-subtle">
              {plan.stops.every((s) => s.indoor) ? '室內為主' : '室內外都有'}
              ・步行量與交通時間待確認
              <br />
              {plan.stayMinutes > THEME.targetMinutes
                ? `停留已超過目標${THEME.targetMinutes / 60}小時，可以縮短行程。`
                : `目標${THEME.targetMinutes / 60}小時，需確認位置後評估是否可行。`}
            </p>
            <button
              type="button"
              onClick={() => navigate('/explore/plan')}
              className="mt-3 w-full rounded-xl bg-primary py-3 text-[16px] font-bold text-white transition-transform active:scale-[.98]"
            >
              查看行程
            </button>
          </article>
        </section>

        {/* ── 附近靈感 ── */}
        <section ref={nearbyRef} id="nearby" className="mt-5 scroll-mt-3" aria-labelledby="nearby-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="nearby-title" className="text-[18px] font-bold">
              附近靈感，加入你的小行程
            </h2>
            <span className="shrink-0 text-[13px] text-primary">已選{plan.stops.length}站</span>
          </div>

          {shown.length > 0 ? (
            <ul className="mt-2.5 space-y-2.5">
              {shown.map((p) => {
                const order = plan.orderOf(p.id)
                return (
                  <li
                    key={p.id}
                    className="flex gap-3 rounded-2xl bg-surface p-3 shadow-[0_2px_12px_rgba(22,32,55,.05)]"
                  >
                    <PlaceThumb kind={p.kind} className="h-[50px] w-[50px]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-[16px] font-bold">{p.name}</p>
                        {order > 0 ? (
                          /* 已選的再按一次就拿掉（至少留一站） */
                          <button
                            type="button"
                            onClick={() => plan.remove(p.id)}
                            disabled={plan.stops.length <= 1}
                            aria-label={`${p.name}：第${order}站，按一下移出小行程`}
                            className="hit-area flex shrink-0 items-center gap-0.5 text-[13px] text-muted"
                          >
                            <CheckIcon width={14} height={14} />
                            第{order}站
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              plan.add(p.id)
                              setJustAdded(p.name)
                            }}
                            className="hit-area shrink-0 text-[13px] font-semibold text-primary"
                          >
                            加入行程
                          </button>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[13px] text-muted">{p.blurb}</p>
                      <p className="mt-1 text-[12px] text-subtle">示意景點・地址／營業待確認</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-2.5 rounded-2xl bg-surface p-4 text-[13px] text-subtle">
              這個分類目前沒有示意景點，換個分類看看。
            </p>
          )}

          {justAdded && plan.saved && (
            <p className="mt-2.5 text-[13px] text-success" role="status">
              已把「{justAdded}」加入今天的小行程。
              <Link to="/trips" className="ml-1 font-semibold underline underline-offset-2">
                到行程頁查看
              </Link>
            </p>
          )}

          <p className="mt-3 text-[12px] text-subtle">
            景點與照片皆為示意；加入候選後再調整行程。
          </p>
        </section>
      </div>

      <PromptBar placeholder="搜尋景點、主題與小行程" onSubmit={ask} />

      {missionId && (
        <MissionFromLink
          id={missionId}
          lat={params.get('lat')}
          lon={params.get('lon')}
          onClose={() => setParams({}, { replace: true })}
        />
      )}
    </div>
  )
}

/*
 * 從對話卡或通知帶著任務進來（/explore?mission=<id>&lat=&lon=）。
 *
 * 用連結帶來的座標查附近任務，找到就打開任務面板（比較走路／捷運／叫車）。
 * 找不到就什麼都不畫 —— 跟舊版一樣，不為一筆查不到的任務放空面板。
 */
function MissionFromLink({
  id,
  lat,
  lon,
  onClose,
}: {
  id: string
  lat: string | null
  lon: string | null
  onClose: () => void
}) {
  const me = useUserLocation()
  /* Number(null) 是 0，不先擋掉的話沒帶座標會去查非洲外海 */
  const linkLat = lat === null ? NaN : Number(lat)
  const linkLon = lon === null ? NaN : Number(lon)
  const ok = Number.isFinite(linkLat) && Number.isFinite(linkLon)
  const missions = useNearbyMissions(ok ? linkLat : me.lat, ok ? linkLon : me.lon, 5_000)
  const mission = missions.find((m) => m.id === id)
  if (!mission) return null
  return (
    <MissionSheet
      mission={mission}
      origin={me.precise ? { lat: me.lat, lon: me.lon } : null}
      onClose={onClose}
    />
  )
}
