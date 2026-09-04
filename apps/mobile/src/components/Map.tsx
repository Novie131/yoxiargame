import { useEffect, useRef, useState } from 'react'

/*
 * MapLibre 的 worker 位址要自己指定。
 *
 * 它預設會用 blob worker 去 import 自己套件目錄裡的 maplibre-gl-worker.mjs，
 * 但打包之後那個檔案不在輸出目錄裡（dev 是 .vite/deps、build 是 assets/），
 * 於是 worker 起不來。症狀極難認：canvas、縮放鈕、姓名標示全都正常出現，
 * 但一個圖磚請求都不會發，console 也不會有錯誤 —— worker 的載入失敗
 * 不會浮到頁面層。
 *
 * 用 ?worker&url 讓 Vite 把 worker 連同它的相依一起打包，並回傳一個
 * 真實存在的網址，dev 與 build 兩邊都成立。
 */
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

import { STYLE_URL, TAIWAN_BOUNDS, type Coordinate } from '@/lib/map'

/*
 * 共用地圖元件。
 *
 * 兩個地方要用：探索頁的活動地圖，以及叫車流程（目前那幾頁的地圖還是設計稿截圖，
 * 不能拖曳縮放，Document/ROADMAP.md 已經把它列為上架前的技術阻礙）。
 * 所以從一開始就做成可重用的，不要在探索頁裡寫死一份。
 *
 * MapLibre 壓縮後有兩百多 KB，比目前整包 App 還大，所以用動態 import ——
 * 它會被切成獨立的 chunk，只有真的開到有地圖的畫面才下載。
 * 首頁與行程頁完全不受影響。
 */

export type MapMarker = {
  id: string
  position: Coordinate
  label?: string
}

/*
 * 「我在這裡」的藍點。用自訂 DOM 而不是 MapLibre 預設的圖釘 ——
 * 圖釘是「某個地點」的語彙，使用者自身的位置在各家地圖裡都是圓點加光暈。
 */
function userDotElement(): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('aria-label', '你的位置')
  el.style.cssText = [
    'width:16px', 'height:16px', 'border-radius:9999px',
    'background:#1A73E8', 'border:3px solid #fff',
    'box-shadow:0 0 0 4px rgba(26,115,232,.25), 0 1px 4px rgba(0,0,0,.35)',
  ].join(';')
  return el
}

export function Map({
  center,
  zoom,
  markers = [],
  userLocation,
  className,
}: {
  center: Coordinate
  zoom: number
  markers?: MapMarker[]
  /*
   * 使用者的真實位置。只有真的定位到才傳進來 ——
   * 傳退路座標會在畫面上變成一個假的「你在這裡」，那比不顯示更糟。
   */
  userLocation?: Coordinate | null
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  /* MapLibre 的實例與型別都是動態載進來的，這裡不能靜態引用它的型別 */
  const mapRef = useRef<import('maplibre-gl').Map | null>(null)
  const markerRefs = useRef<Array<import('maplibre-gl').Marker>>([])
  const userMarkerRef = useRef<import('maplibre-gl').Marker | null>(null)
  const [failed, setFailed] = useState(false)
  /*
   * 地圖建好了沒。標記的 effect 一定要等它。
   *
   * 地圖是非同步建立的（動態 import + 載入樣式），而位置可能瞬間就回來
   * ——定位有快取時就是 0ms。少了這個旗標，標記的 effect 會在 mapRef 還是
   * null 時跑完並直接 return，而它的相依（userLocation）之後不再變動，
   * 於是永遠不會補畫，藍點就這樣消失了。
   */
  const [ready, setReady] = useState(false)

  /*
   * 建立地圖時要用「最新」的視野，不是第一次 render 當下的。
   *
   * 地圖是非同步建立的，而位置可能在那之前就回來了。若用閉包裡捕捉到的
   * center，地圖會停在舊座標（例如還沒定位到的退路位置），
   * 而下面那個 flyTo 的 effect 當時 mapRef 還是 null，補不回來。
   */
  const viewRef = useRef({ center, zoom })
  viewRef.current = { center, zoom }

  /* 建立地圖。只跑一次 —— 中心與縮放的後續變動走下面那個 effect。 */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    void (async () => {
      try {
        const [{ Map: MapLibreMap, NavigationControl, GeolocateControl, FullscreenControl, setWorkerUrl }] =
          await Promise.all([
            import('maplibre-gl'),
            import('maplibre-gl/dist/maplibre-gl.css'),
          ])
        /* 載入期間畫面可能已經被卸載了 */
        if (cancelled) return

        setWorkerUrl(maplibreWorkerUrl)

        const map = new MapLibreMap({
          container,
          style: STYLE_URL,
          center: [viewRef.current.center.lng, viewRef.current.center.lat],
          zoom: viewRef.current.zoom,
          maxBounds: TAIWAN_BOUNDS,
          /*
           * 手勢維持 MapLibre 的預設，也就是跟 Google 地圖一樣：
           * 單指拖曳平移、雙指（或滾輪）縮放、雙擊放大。
           *
           * 這裡原本開了 cooperativeGestures —— 那個選項會要求雙指才能操作地圖、
           * 單指留給頁面捲動。立意是讓長頁面好捲，但代價是地圖用起來像一張靜態圖片，
           * 完全不值得。頁面捲動改用下面的做法解決：地圖以外的地方都能捲，
           * 想要更大的操作空間就按全螢幕。
           */
          attributionControl: { compact: true },
        })

        map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
        map.addControl(new FullscreenControl(), 'top-right')
        /*
         * 「我的位置」。跟 Google 地圖一樣是地圖上最常按的鈕。
         * showUserLocation 關掉 —— 藍點由上面的 userLocation 統一負責，
         * 開著的話按下去會多出第二個點。
         */
        map.addControl(
          new GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showUserLocation: false,
          }),
          'top-right',
        )

        /* 圖磚拿不到時不要留一塊空白，換成可讀的說明 */
        map.on('error', (e) => {
          console.warn('[map]', e.error?.message ?? e)
        })

        mapRef.current = map
        setReady(true)
      } catch (error) {
        console.error('[map] 載入失敗：', error)
        if (!cancelled) setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      setReady(false)
      mapRef.current?.remove()
      mapRef.current = null
      /* 地圖沒了，標記的參照也要清掉，否則下次會拿到已銷毀地圖上的 Marker */
      userMarkerRef.current = null
      markerRefs.current = []
    }
    /*
     * center 與 zoom 只當初始值，不放進相依 —— 放進去的話每次切換城市
     * 都會整個地圖重建，圖磚要重下載，畫面會白一下。
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* 視野變動（切換城市、定位回來）：飛過去，不重建地圖 */
  useEffect(() => {
    if (!ready) return
    mapRef.current?.flyTo({ center: [center.lng, center.lat], zoom, duration: 900 })
  }, [center.lng, center.lat, zoom, ready])

  /* 標記。每次變動就整批換掉 —— 目前的數量很小，做增量比對不划算。 */
  useEffect(() => {
    let cancelled = false

    if (!ready) return

    void (async () => {
      const { Marker, Popup } = await import('maplibre-gl')
      const map = mapRef.current
      if (cancelled || !map) return

      for (const m of markerRefs.current) m.remove()
      markerRefs.current = markers.map((m) => {
        const marker = new Marker({ color: '#D8654F' }).setLngLat([
          m.position.lng,
          m.position.lat,
        ])
        if (m.label) marker.setPopup(new Popup({ offset: 24 }).setText(m.label))
        return marker.addTo(map)
      })
    })()

    return () => {
      cancelled = true
    }
  }, [markers, ready])

  /* 使用者位置的藍點。位置會變動（定位回來、或使用者移動），所以只移動不重建。 */
  useEffect(() => {
    let cancelled = false

    if (!ready) return

    void (async () => {
      const { Marker } = await import('maplibre-gl')
      const map = mapRef.current
      if (cancelled || !map) return

      if (!userLocation) {
        userMarkerRef.current?.remove()
        userMarkerRef.current = null
        return
      }

      const lngLat: [number, number] = [userLocation.lng, userLocation.lat]
      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat(lngLat)
      } else {
        userMarkerRef.current = new Marker({ element: userDotElement() })
          .setLngLat(lngLat)
          .addTo(map)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [userLocation, ready])

  if (failed) {
    return (
      <div
        className={`flex items-center justify-center bg-surface-2 text-[13px] text-muted ${className ?? ''}`}
      >
        地圖暫時無法載入
      </div>
    )
  }

  return <div ref={containerRef} className={className} />
}
