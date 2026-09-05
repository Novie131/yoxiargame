import type { ReactNode } from 'react'

import { Map } from './Map'
import { useUserLocation } from '@/lib/location'

/*
 * 叫車流程四頁共用的地圖底圖。
 *
 * 這裡原本是設計稿裁下來的 PNG，不能拖曳也不能縮放 ——
 * Document/ROADMAP.md 把「真實地圖」列為上架前的技術阻礙，指的就是這個。
 * 現在換成真的地圖，四個上層畫面完全不用動（當初留的介面就是為了這一刻）。
 *
 * 內建控制項關掉：叫車那幾頁右上角已經有自己的定位與返回按鈕，
 * 兩套疊在一起會互相蓋住。地圖本身照樣可以拖曳縮放。
 */
export function MapBackdrop({
  zoom = 15,
  children,
}: {
  /** 預設 15，大約是看得到街廓與路名的層級，適合叫車的取放點 */
  zoom?: number
  children?: ReactNode
}) {
  const location = useUserLocation()

  return (
    <div className="relative min-h-0 flex-1 bg-surface-3">
      {/*
        * 定位要靠外層這個 div，不能把 absolute inset-0 直接給 Map ——
        * MapLibre 的 CSS 有 .maplibregl-map { position: relative }，
        * 而它是動態載入的、排在 Tailwind 之後，同權重下後載入的勝，
        * absolute 會被蓋掉、inset-0 失效，地圖高度就塌成 0（踩過）。
        */}
      <div className="absolute inset-0">
        <Map
          center={{ lng: location.lon, lat: location.lat }}
          zoom={zoom}
          /* 沒定位到就不畫藍點，只把視野放在預設位置（台北市信義區） */
          userLocation={location.precise ? { lng: location.lon, lat: location.lat } : null}
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
