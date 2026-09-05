import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'

import eventGoFest from '@/assets/maps/event-gofest.png'
import { HomeHeader } from '@/components/HomeHeader'
import { Map } from '@/components/Map'
import { MissionSheet } from '@/components/MissionSheet'
import { MapPinIcon } from '@/components/icons'
import { TaskProgress } from '@/components/TaskProgress'
import { INTERESTS, toggleInterest, useInterests } from '@/lib/interests'
import { FALLBACK_LABEL, useUserLocation } from '@/lib/location'
import { useNearbyMissions } from '@/lib/missions'
import { CITIES } from '@/lib/map'

/*
 * 對應設計稿 frame：exploration-home（工作區/exploration-home-5.png）
 *
 * 注意：這頁的設計稿在「工作區」而非「初步確定方向」，屬於探索過程的產物。
 * 我選了編號系列的最後一版，因為它的 tab bar 跟確定方向那批一致
 * （exploration-home-v2 用的是「探索／地圖／收藏／個人」，是另一套導航）。
 * 設計拍板後可能需要調整。
 *
 * 地圖是真的可以拖曳縮放的（MapLibre + OpenStreetMap 圖磚），不是設計稿截圖。
 *
 * 開啟時預設看使用者所在的位置；沒有定位權限就退到台北市信義區，
 * 而且那種情況下**不會**畫「你在這裡」的藍點 —— 在一個猜出來的座標上
 * 標示使用者本人，比不標示更糟。畫面上會直接說明現在是預設位置。
 *
 * 地圖上的標記來自 missions 表（PostGIS 空間查詢），不是寫死的示範資料 ——
 * 沒有資料就是沒有標記。任務資料用 apps/api 的 seed:missions 建立。
 */

const events = [
  {
    id: 'gofest-2026',
    tag: '年度特大慶典',
    date: '8/15 - 8/16 09:00-18:00',
    title: 'GO Fest 2026 台北：大安森林公園慶典',
    image: eventGoFest,
    address: '台北市大安區新生南路二段1號',
  },
]

export function ExploreScreen() {

  const mapRef = useRef<HTMLDivElement>(null)
  const location = useUserLocation()
  const { selected, matches } = useInterests()
  /*
   * 沒選城市時看使用者的位置。選了才切到那個城市，
   * 這樣「我在哪」是預設，城市按鈕是刻意的跳轉。
   */
  /*
   * 通知會導到 /explore?mission=<id>，直接打開那個任務的面板 ——
   * 主動推薦如果只是把人丟到探索頁，他還得自己在地圖上找回那個任務。
   */
  const [params] = useSearchParams()
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(
    () => params.get('mission'),
  )
  const [cityId, setCityId] = useState<string | null>(null)
  const city = CITIES.find((c) => c.id === cityId) ?? null

  /*
   * 從通知進來時，通知會帶著被推薦任務的座標 —— 把地圖移過去，
   * 那個任務才會落在「附近」的查詢範圍內，面板也才打得開。
   */
  const linkedLat = Number(params.get('lat'))
  const linkedLon = Number(params.get('lon'))
  const linkedCenter =
    Number.isFinite(linkedLat) && Number.isFinite(linkedLon) && params.get('mission')
      ? { lng: linkedLon, lat: linkedLat }
      : null

  const view = linkedCenter
    ? { center: linkedCenter, zoom: 15 }
    : city
      ? { center: city.center, zoom: city.zoom }
      : { center: { lng: location.lon, lat: location.lat }, zoom: 13 }

  /*
   * 搜尋半徑跟著視野走：看整個城市時要涵蓋市域，看自己位置時只找走得到的範圍。
   */
  const missions = useNearbyMissions(
    view.center.lat,
    view.center.lng,
    city ? 20_000 : 5_000,
  )

  /*
   * 一定要 memo。Map 的標記 effect 相依於這個陣列，每次 render 都給新陣列的話
   * 標記會被反覆刪掉重畫，畫面會閃。
   */
  const selectedMission = missions.find((m) => m.id === selectedMissionId) ?? null

  /*
   * 網址換了就在 render 當下同步，不要用 effect ——
   * 等 effect 的話中間會有一幀顯示的是上一個任務。這是 React 官方的
   * 「render 期間調整 state」寫法，不是副作用（lib/transit.ts 也是這樣做的）。
   */
  const deepLinkedId = params.get('mission')
  const [renderedDeepLink, setRenderedDeepLink] = useState(deepLinkedId)
  if (renderedDeepLink !== deepLinkedId) {
    setRenderedDeepLink(deepLinkedId)
    if (deepLinkedId) setSelectedMissionId(deepLinkedId)
  }

  /*
   * 全部畫出來，不符合篩選的變淡而不是移除。
   * 直接篩掉會讓地圖突然清空，看起來像故障。
   */
  const markers = useMemo(
    () =>
      missions.map((m) => ({
        id: m.id,
        position: { lng: m.lon, lat: m.lat },
        dimmed: !matches(m.tags),
      })),
    [missions, matches],
  )

  const matchedCount = markers.filter((m) => !m.dimmed).length

  return (
    <div
      className="relative min-h-full"
      style={{ background: 'linear-gradient(180deg, #FCEFEB 0%, #FCEFEB 55%, #F9F1EF 100%)' }}
    >
      <HomeHeader />

      <section className="px-5">
        <h2 className="text-[17px] font-bold">選擇你想探索的內容</h2>
        <p className="mt-1 text-[13px] text-subtle">
          你可以選擇多個標籤，我們會根據你的興趣推薦內容
        </p>

        <div className="mt-3.5 flex flex-wrap gap-2">
          {INTERESTS.map(({ id, label, hasData }) => {
            const on = selected.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleInterest(id)}
                aria-pressed={on}
                className={[
                  'rounded-full px-3.5 py-2 text-[13px] transition-colors',
                  on
                    ? 'border border-primary text-primary'
                    : 'border border-transparent text-ink',
                ].join(' ')}
                style={on ? undefined : { background: '#F8E1DB' }}
              >
                {label}
                {/* 目前沒有任何任務掛這個標籤，先講清楚免得使用者以為壞了 */}
                {!hasData && <span className="ml-1 text-[10px] text-subtle">尚無任務</span>}
              </button>
            )
          })}
        </div>

        {/*
          * 原本這裡寫「正在為你生成最新活動......」，但它是一段永遠不會結束的
          * 靜態文字 —— 背後沒有任何請求。等 missions 接上來、真的有在查詢時
          * 再放載入狀態；在那之前不要讓畫面假裝正在忙。
          */}
      </section>

      <section ref={mapRef} className="mt-3 px-4">
        <div className="overflow-hidden rounded-2xl bg-surface shadow-[0_2px_14px_rgba(22,32,55,.07)]">
          <div className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-3.5">
            <h3 className="text-[17px] font-bold">探索地圖</h3>
            {/* 三個城市先當範例，之後改成可搜尋 */}
            <div className="flex gap-1">
              {CITIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  /* 再按一次回到自己的位置 */
                  onClick={() => setCityId((prev) => (prev === c.id ? null : c.id))}
                  aria-pressed={c.id === cityId}
                  className={[
                    'rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors',
                    c.id === cityId ? 'bg-primary text-white' : 'bg-surface-3 text-muted',
                  ].join(' ')}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <Map
            center={view.center}
            zoom={view.zoom}
            markers={markers}
            onMarkerClick={setSelectedMissionId}
            /* 沒定位到就不畫藍點，只是把視野放在預設位置 */
            userLocation={location.precise ? { lng: location.lon, lat: location.lat } : null}
            className="h-[340px] w-full"
          />

          <p className="px-4 py-2.5 text-[12px] text-subtle">
            {markers.length > 0
              ? selected.length > 0
                ? matchedCount > 0
                  ? `符合你興趣的有 ${matchedCount} 個，另外 ${markers.length - matchedCount} 個已淡化。`
                  : `這一帶的 ${markers.length} 個任務都不符合你選的興趣。`
                : `這一帶有 ${markers.length} 個探索任務，點圖釘看怎麼去。`
              : location.precise
                ? '藍點是你目前的位置。這一帶目前沒有探索任務。'
                : `未取得定位權限，先顯示${FALLBACK_LABEL}。開啟定位後會移到你的位置。`}
          </p>
        </div>
      </section>

      <section className="mt-3 px-4 pb-4">
        <div className="rounded-2xl bg-surface p-4 shadow-[0_2px_14px_rgba(22,32,55,.07)]">
          <h3 className="text-[17px] font-bold">近期活動</h3>
          <p className="mt-0.5 text-[12px] text-subtle">
            為您嚴選推薦的寶可夢GO熱門大事件
          </p>

          {events.map((e) => (
            <article key={e.id} className="mt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-md border border-primary px-2 py-1 text-[11px] font-semibold text-primary">
                  {e.tag}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                  {e.date}
                </span>
              </div>

              <h4 className="mt-2 truncate text-[15px] font-bold">{e.title}</h4>

              {/* 縮圖裡的「主會場」標籤是設計稿烘焙進去的，靜態不需互動 */}
              <img
                src={e.image}
                alt={e.title}
                className="mt-2 w-full rounded-lg object-cover"
              />

              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-muted">
                <MapPinIcon />
                {e.address}
              </p>
            </article>
          ))}

          {/*
            * 分頁圓點原本固定畫三顆，但活動只有一筆，而且點了也不能翻頁。
            * 改成跟著實際筆數走：只有一筆就不畫，有多筆時才是有意義的指示器。
            */}
          {events.length > 1 && (
            <div className="mt-3 flex justify-center gap-1.5">
              {events.map((e, i) => (
                <span
                  key={e.id}
                  className={[
                    'h-1.5 rounded-full transition-all',
                    i === 0 ? 'w-5 bg-primary' : 'w-1.5 bg-line',
                  ].join(' ')}
                />
              ))}
            </div>
          )}
        </div>

        {/*
          * 這顆鈕原本按了沒有任何反應。目前這一頁真正能「開始探索」的東西
          * 就是地圖，所以先讓它捲到地圖 —— 等 missions 接上來、有活動詳情頁
          * 之後再改成導頁。做不到的事不要放按鈕，但已經在的按鈕也不必是死的。
          */}
        <button
          type="button"
          onClick={() => mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          className="mt-4 w-full rounded-full bg-primary py-3.5 text-[16px] font-bold tracking-[.4em] text-white transition-transform active:scale-[.98]"
        >
          開始探索
        </button>
      </section>

      {selectedMission && (
        <MissionSheet
          mission={selectedMission}
          /* 沒定位到就沒辦法比較怎麼去，面板會照實說 */
          origin={location.precise ? { lat: location.lat, lon: location.lon } : null}
          onClose={() => setSelectedMissionId(null)}
        />
      )}

      <TaskProgress badge={3} />
    </div>
  )
}
