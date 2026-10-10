import type { ReactNode } from 'react'

import { Map, type FitPadding, type MapMarker, type MapRoute } from './Map'
import { useUserLocation } from '@/lib/location'

/*
 * 叫車流程四頁共用的地圖底圖。
 *
 * 這裡原本是設計稿裁下來的 PNG，不能拖曳也不能縮放 ——
 * Document/PlanMD/ROADMAP.md 把「真實地圖」列為上架前的技術阻礙，指的就是這個。
 * 現在換成真的地圖，四個上層畫面完全不用動（當初留的介面就是為了這一刻）。
 *
 * 內建控制項關掉：叫車那幾頁右上角已經有自己的定位與返回按鈕，
 * 兩套疊在一起會互相蓋住。地圖本身照樣可以拖曳縮放。
 */
export function MapBackdrop({
  zoom = 15,
  center,
  markers = [],
  route,
  fitBounds,
  fitPadding,
  showUserLocation = true,
  children,
}: {
  /** 預設 15，大約是看得到街廓與路名的層級，適合叫車的取放點 */
  zoom?: number
  /*
   * 視野中心。不給就用使用者的位置 ——
   * 叫車流程選好目的地之後要看的是那一段路，不是他站的地方。
   */
  center?: { lat: number; lon: number } | null
  /** 上車點與下車點 */
  markers?: MapMarker[]
  /** 路線與要完整看到的範圍，見 Map 的同名參數 */
  route?: MapRoute | null
  fitBounds?: [number, number, number, number] | null
  fitPadding?: FitPadding
  /*
   * 要不要畫「你在這裡」的藍點。
   * 叫車流程四頁都自己畫上車點／目前位置，藍點會疊在同一個位置變成兩個點；
   * 行程中那頁更糟 —— 車在模擬的路線上跑，藍點卻停在使用者真實的位置。
   */
  showUserLocation?: boolean
  children?: ReactNode
}) {
  const location = useUserLocation()
  const focus = center ?? { lat: location.lat, lon: location.lon }

  /*
   * 橫向（short）時保底 144px。底部面板不會縮，min-h-0 的地圖就成了唯一被擠的人 ——
   * 實測會被壓到剩 10px，疊在上面的搜尋框、返回鈕就直接壓到面板上。
   * 保底之後整頁會比畫面高一點，由 AppShell 的 main 負責捲動。
   * 直向不受影響：最矮的直向手機上地圖也還有 90px 以上，加保底反而會把 CTA 推出畫面。
   */
  return (
    <div className="relative min-h-0 flex-1 bg-surface-3 short:min-h-36">
      {/*
        * 定位要靠外層這個 div，不能把 absolute inset-0 直接給 Map ——
        * MapLibre 的 CSS 有 .maplibregl-map { position: relative }，
        * 而它是動態載入的、排在 Tailwind 之後，同權重下後載入的勝，
        * absolute 會被蓋掉、inset-0 失效，地圖高度就塌成 0（踩過）。
        */}
      <div className="absolute inset-0">
        <Map
          center={{ lng: focus.lon, lat: focus.lat }}
          zoom={zoom}
          markers={markers}
          route={route}
          fitBounds={fitBounds}
          fitPadding={fitPadding}
          /* 沒定位到就不畫藍點，只把視野放在預設位置（臺北市信義區） */
          userLocation={
            showUserLocation && location.precise ? { lng: location.lon, lat: location.lat } : null
          }
          controls={false}
          className="h-full w-full"
        />
      </div>
      {/*
        * 疊在地圖上的 UI。放在地圖之後，靠 DOM 順序疊上去 ——
        * 不用 z-index 是因為兩者都是 absolute，後面的自然畫在上面，
        * 也不會擋到地圖的拖曳（overlay 只佔它們自己的範圍）。
        */}
      {children}
    </div>
  )
}
