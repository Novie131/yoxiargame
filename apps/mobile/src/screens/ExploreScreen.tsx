import { useState } from 'react'

import eventGoFest from '@/assets/maps/event-gofest.png'
import { HomeHeader } from '@/components/HomeHeader'
import { Map } from '@/components/Map'
import { MapPinIcon } from '@/components/icons'
import { TaskProgress } from '@/components/TaskProgress'
import { FALLBACK_LABEL, useUserLocation } from '@/lib/location'
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
 * 除了使用者的藍點之外沒有任何標記，那是正確的狀態，不是還沒畫完：
 * 地點資料要等 missions 表（schema 早就建好了，含 PostGIS 地理索引）接上來，
 * 在那之前寧可給一張乾淨的地圖，也不要放假的圖釘。
 */

const interests = [
  { id: 'pokemon-go', label: 'Pokémon GO 寶可夢 GO' },
  { id: 'pikmin', label: 'Pikmin 皮克敏' },
  { id: 'food', label: '美食' },
  { id: 'travel', label: '旅行' },
  { id: 'sport', label: '運動' },
  { id: 'music', label: '音樂' },
  { id: 'photo', label: '攝影' },
  { id: 'reading', label: '閱讀' },
  { id: 'movie', label: '電影' },
  { id: 'tech', label: '科技' },
  { id: 'bar', label: '酒吧' },
  { id: 'coffee', label: '咖啡' },
]

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
  const [selected, setSelected] = useState<string[]>(['pokemon-go'])

  const location = useUserLocation()
  /*
   * 沒選城市時看使用者的位置。選了才切到那個城市，
   * 這樣「我在哪」是預設，城市按鈕是刻意的跳轉。
   */
  const [cityId, setCityId] = useState<string | null>(null)
  const city = CITIES.find((c) => c.id === cityId) ?? null

  const view = city
    ? { center: city.center, zoom: city.zoom }
    : { center: { lng: location.lon, lat: location.lat }, zoom: 13 }

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

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
          {interests.map(({ id, label }) => {
            const on = selected.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
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
              </button>
            )
          })}
        </div>

        <p className="mt-4 text-[13px] text-subtle">正在為你生成最新活動......</p>
      </section>

      <section className="mt-3 px-4">
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
            /* 沒定位到就不畫藍點，只是把視野放在預設位置 */
            userLocation={location.precise ? { lng: location.lon, lat: location.lat } : null}
            className="h-[340px] w-full"
          />

          <p className="px-4 py-2.5 text-[12px] text-subtle">
            {location.precise
              ? '藍點是你目前的位置。拖曳平移、雙指或滾輪縮放。'
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

          <div className="mt-3 flex justify-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={[
                  'h-1.5 rounded-full transition-all',
                  i === 0 ? 'w-5 bg-primary' : 'w-1.5 bg-line',
                ].join(' ')}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          className="mt-4 w-full rounded-full bg-primary py-3.5 text-[16px] font-bold tracking-[.4em] text-white transition-transform active:scale-[.98]"
        >
          開始探索
        </button>
      </section>

      <TaskProgress badge={3} />
    </div>
  )
}
