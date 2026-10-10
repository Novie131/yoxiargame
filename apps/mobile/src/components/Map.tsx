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

import { markerElement, tokenColor, type MarkerVariant } from './mapMarkers'

/*
 * 共用地圖元件。
 *
 * 兩個地方要用：探索頁的活動地圖，以及叫車流程（目前那幾頁的地圖還是設計稿截圖，
 * 不能拖曳縮放，Document/PlanMD/ROADMAP.md 已經把它列為上架前的技術阻礙）。
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
  /*
   * 不符合目前篩選條件。畫淡而不是移除 ——
   * 地圖上的東西突然清空會讓人以為壞了，而且「附近還有別的、只是不符合
   * 你選的興趣」本身就是有用的資訊。
   */
  dimmed?: boolean
  /*
   * 叫車流程用的造型（上車點、終點、車輛…，見 mapMarkers）。
   * 不給就是原本的圖釘 —— 探索頁維持原樣。有造型的標記直接把 label 印在旁邊，
   * 不另外掛 popup。
   */
  variant?: MarkerVariant
}

/** 地圖上的一條路線。dashed 用在「拿不到道路、只好畫直線」的時候。 */
export type MapRoute = {
  coordinates: Coordinate[]
  dashed?: boolean
}

export type FitPadding = { top: number; bottom: number; left: number; right: number }

/*
 * fit 的預設留白。上方要讓開疊在地圖上的搜尋框／返回鈕／狀態膠囊，
 * 下方要讓開標記底下的地名。
 *
 * 右邊特別寬是為了右下角的定位鈕：路線常常是左上往右下走（臺北車站→101），
 * 終點就落在右下角，留白不夠時終點的地名會整個被那顆鈕蓋住（估價頁實測過）。
 */
const DEFAULT_FIT_PADDING: FitPadding = { top: 76, bottom: 84, left: 52, right: 92 }

/*
 * 留白太大時等比例縮小。
 *
 * MapLibre 的 fitBounds 在留白加起來超過畫面時會直接放棄（只在 console 警告），
 * 視野就停在原地 —— 橫向手機上地圖只剩 144px 高，預設的上下留白就已經超過了。
 */
function clampPadding(p: FitPadding, width: number, height: number): FitPadding {
  const room = 48
  const v = Math.min(1, Math.max(0, height - room) / Math.max(1, p.top + p.bottom))
  const h = Math.min(1, Math.max(0, width - room) / Math.max(1, p.left + p.right))
  return { top: p.top * v, bottom: p.bottom * v, left: p.left * h, right: p.right * h }
}

const ROUTE_SOURCE = 'ride-route'
const ROUTE_CASING = 'ride-route-casing'
const ROUTE_LINE = 'ride-route-line'

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
  onMarkerClick,
  userLocation,
  controls = true,
  route,
  fitBounds,
  fitPadding,
  className,
}: {
  center: Coordinate
  zoom: number
  markers?: MapMarker[]
  /*
   * 有給就走自訂的詳情面板，不用 MapLibre 內建的 popup ——
   * popup 只能放文字，任務詳情需要放可以按的選項。
   */
  onMarkerClick?: (id: string) => void
  /*
   * 使用者的真實位置。只有真的定位到才傳進來 ——
   * 傳退路座標會在畫面上變成一個假的「你在這裡」，那比不顯示更糟。
   */
  userLocation?: Coordinate | null
  /*
   * 內建的縮放／全螢幕／定位鈕。叫車流程要關掉 ——
   * 那幾頁的右上角已經有自己的按鈕，兩套疊在一起會互相蓋住。
   */
  controls?: boolean
  /** 叫車流程的路線（上車點→目的地、司機→上車點）。 */
  route?: MapRoute | null
  /*
   * 有給就讓這個範圍 [西, 南, 東, 北] 完整落在畫面裡，center 與 zoom 改成只當初始值。
   * 叫車流程要同時看到上車點與目的地，單靠中心點做不到。
   *
   * 只有範圍改變時才重新 fit；使用者自己拖過、縮放過之後，
   * 地圖尺寸變動（底部面板長高）也不再把視野搶回來。
   */
  fitBounds?: [number, number, number, number] | null
  fitPadding?: FitPadding
  /*
   * 要給明確的尺寸（h-[340px]、h-full…）。
   *
   * 不要用 absolute inset-0 來撐開它：MapLibre 的 CSS 有
   * .maplibregl-map { position: relative }，而它是動態載入的、排在 Tailwind
   * 之後，同權重下後載入的勝 —— absolute 會被蓋掉、inset-0 失效，
   * 地圖高度塌成 0，畫面上看起來就是一塊空白。要絕對定位請包一層外層 div。
   */
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
   * 樣式載完了沒。路線圖層要等它 —— addSource 在樣式還沒到之前會丟例外。
   * 不能拿 map.isStyleLoaded() 臨時判斷：圖磚還在下載時它也回 false，
   * 而 load 事件只發一次，錯過了就永遠畫不上去。
   */
  const [styleLoaded, setStyleLoaded] = useState(false)

  /* fit 相關的最新值。地圖的 resize 事件是在建立時掛上的，要讀 ref 才拿得到最新的 */
  const fitRef = useRef({ bounds: fitBounds ?? null, padding: fitPadding ?? DEFAULT_FIT_PADDING })
  fitRef.current = { bounds: fitBounds ?? null, padding: fitPadding ?? DEFAULT_FIT_PADDING }
  /* 使用者動過地圖就不再自動 fit，直到範圍本身改變（換了一段路） */
  const userMovedRef = useRef(false)
  const fittedOnceRef = useRef(false)

  const applyFit = (animate: boolean) => {
    const map = mapRef.current
    const { bounds, padding } = fitRef.current
    if (!map || !bounds) return
    const el = map.getContainer()
    const width = el.clientWidth
    const height = el.clientHeight
    /* 版面還沒排好（高度 0）時 fit 出來的縮放是錯的，等 resize 事件再來 */
    if (width < 40 || height < 40) return
    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]],
      ],
      {
        padding: clampPadding(padding, width, height),
        /* 兩點很近（或只有一點）時不要放大到看不出街廓 */
        maxZoom: 16,
        duration: animate ? 700 : 0,
      },
    )
  }

  /*
   * 建立地圖時要用「最新」的視野，不是第一次 render 當下的。
   *
   * 地圖是非同步建立的，而位置可能在那之前就回來了。若用閉包裡捕捉到的
   * center，地圖會停在舊座標（例如還沒定位到的退路位置），
   * 而下面那個 flyTo 的 effect 當時 mapRef 還是 null，補不回來。
   */
  const viewRef = useRef({ center, zoom })
  viewRef.current = { center, zoom }

  /* 跟 viewRef 同理：地圖是非同步建立的，要用最新的值而不是閉包裡捕捉到的 */
  const controlsRef = useRef(controls)
  controlsRef.current = controls

  /* 同理：標記建立時要呼叫到最新的回呼，不是第一次 render 捕捉到的 */
  const onMarkerClickRef = useRef(onMarkerClick)
  onMarkerClickRef.current = onMarkerClick

  /* 建立地圖。只跑一次 —— 中心與縮放的後續變動走下面那個 effect。 */
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    void (async () => {
      try {
        const [{ Map: MapLibreMap, AttributionControl, NavigationControl, GeolocateControl, FullscreenControl, setWorkerUrl }] =
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

          /*
           * 預設的版權標示關掉，下面自己加一個放到左下角 ——
           * 它預設在右下角，而叫車那三頁的右下角是「回到目前位置」的準心鈕，
           * 收合後的 ⓘ 會正好壓在它上面。左下角三個畫面都是空的。
           */
          attributionControl: false,
        })

        map.addControl(new AttributionControl({ compact: true }), 'bottom-left')

        /*
         * 版權標示一開始就是收合的 ⓘ 鈕。
         *
         * compact: true 只是「可以收合」，不是「收合著」。MapLibre 在版權文字
         * 到齊的那一刻會掛上 maplibregl-compact 與 maplibregl-compact-show，
         * 也就是展開的狀態，要等使用者拖曳地圖或自己按 ⓘ 才收起來。手機寬度下
         * 那串「OpenFreeMap © OpenMapTiles Data from OpenStreetMap」會斷成兩行，
         * 變成壓在地圖底部的一整條白色橫幅，比地圖本身還搶眼。
         *
         * 這裡是直接把狀態設成「收合」，而不是等它展開後再收回去。
         * 後者試過，會壞：版權文字是跟著 style 進來的，冷啟動時大約要兩三秒，
         * 那時 map 的 load 與 idle 早就發過了，收合的動作撲空 ——
         * 快取熱的時候看起來正常，第一次開的人才會看到那條白線，最難查的那種。
         *
         * MapLibre 的兩個狀態長這樣（讀 AttributionControl._toggleAttribution）：
         *   收合 = maplibregl-compact ＋ 有 open 屬性
         *   展開 = maplibregl-compact ＋ maplibregl-compact-show ＋ 沒有 open
         * open 的用法跟直覺相反，別照 <details> 的語意去推。
         *
         * 先設成收合還有一個好處：MapLibre 之後要展開時，它的判斷是
         * 「還沒有 maplibregl-compact 才加上 compact 與 compact-show」，
         * 我們已經加了，所以它不會再把 -show 補上去，不用跟它搶。
         *
         * 內容本身沒有拿掉，按 ⓘ 就展開 ——
         * 那是 OpenStreetMap／OpenFreeMap 的姓名標示要求，不能整個關掉。
         */
        const attrib = map.getContainer().querySelector('.maplibregl-ctrl-attrib')
        attrib?.classList.add('maplibregl-compact')
        attrib?.setAttribute('open', '')

        if (controlsRef.current) {
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
        }

        /* 圖磚拿不到時不要留一塊空白，換成可讀的說明 */
        map.on('error', (e) => {
          console.warn('[map]', e.error?.message ?? e)
        })

        map.on('load', () => {
          if (!cancelled) setStyleLoaded(true)
        })

        /* 地圖尺寸變了（底部面板長高、轉向）就重新 fit，除非使用者已經自己動過 */
        map.on('resize', () => {
          if (!userMovedRef.current) applyFit(false)
        })
        map.on('dragstart', () => {
          userMovedRef.current = true
        })
        map.on('zoomstart', (e) => {
          /* 只算手勢；fitBounds 自己觸發的 zoomstart 沒有 originalEvent */
          if (e.originalEvent) userMovedRef.current = true
        })

        /*
         * 自己再盯一次容器尺寸，而不是只靠 MapLibre 內建的。
         *
         * MapLibre 會丟掉 ResizeObserver 的第一次回呼（當成「初始尺寸」），
         * 但如果容器在那之前就已經變了 —— 叫車頁的底部面板在估價回來時長高、
         * 把地圖往上擠 —— 被丟掉的正是那次變動，地圖內部就一直以為自己比較高：
         * 畫面下緣那一截被面板蓋住，fit 進去的目的地剛好落在看不到的地方（踩過）。
         */
        const resizeObserver = new ResizeObserver(() => {
          if (!cancelled) map.resize()
        })
        resizeObserver.observe(container)
        map.once('remove', () => resizeObserver.disconnect())

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
      setStyleLoaded(false)
      fittedOnceRef.current = false
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
    /* 有 fitBounds 時視野歸它管，不然兩邊會互相搶 */
    if (!ready || fitRef.current.bounds) return
    mapRef.current?.flyTo({ center: [center.lng, center.lat], zoom, duration: 900 })
  }, [center.lng, center.lat, zoom, ready])

  /* 範圍變了（目的地查到了、道路路線回來了）就重新 fit。第一次不要動畫，直接到位。 */
  const [fitW, fitS, fitE, fitN] = fitBounds ?? []
  useEffect(() => {
    if (!ready || fitW === undefined) return
    userMovedRef.current = false
    applyFit(fittedOnceRef.current)
    fittedOnceRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, fitW, fitS, fitE, fitN])

  /*
   * 路線圖層。每次變動就整個拆掉重建 —— 一頁最多一條線，
   * 比起分別處理「新增／更新資料／切換虛線」三種情況，這樣不會漏狀態。
   */
  const routeCoords = route?.coordinates
  const routeDashed = route?.dashed ?? false
  useEffect(() => {
    const map = mapRef.current
    if (!styleLoaded || !map) return

    try {
      if (map.getLayer(ROUTE_LINE)) map.removeLayer(ROUTE_LINE)
      if (map.getLayer(ROUTE_CASING)) map.removeLayer(ROUTE_CASING)
      if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE)
      if (!routeCoords || routeCoords.length < 2) return

      map.addSource(ROUTE_SOURCE, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: routeCoords.map((p) => [p.lng, p.lat]) },
        },
      })

      /*
       * 插在第一個文字圖層之前：路名、地名會壓在路線上面，
       * 跟各家導航 App 一樣，不會被一條粗線整排蓋掉。
       */
      const beforeId = map.getStyle().layers.find((l) => l.type === 'symbol')?.id
      /* 設計稿的路線是品牌色。底下墊一條半透明的寬線，在灰色的道路上才跳得出來 */
      const color = tokenColor('--color-primary', '#D8654F')

      map.addLayer(
        {
          id: ROUTE_CASING,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': color, 'line-width': 11, 'line-opacity': 0.22 },
        },
        beforeId,
      )
      map.addLayer(
        {
          id: ROUTE_LINE,
          type: 'line',
          source: ROUTE_SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': color,
            'line-width': 5,
            /* 直線退路畫成虛線，一眼看得出那不是實際道路 */
            ...(routeDashed ? { 'line-dasharray': [1, 1.6] } : {}),
          },
        },
        beforeId,
      )
    } catch (error) {
      /* 畫不上去就少一條線，地圖本身與標記照常 —— 不值得讓整頁壞掉 */
      console.warn('[map] 路線圖層失敗：', error)
    }
  }, [styleLoaded, routeCoords, routeDashed])

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
        /*
         * 透明度要用 MapLibre 的 opacity 選項，不能自己設行內樣式 ——
         * 它有內建的遮蔽淡化機制，每次更新都會把元素的 opacity 寫成自己的值，
         * 直接改 style.opacity 會被無聲蓋掉（踩過）。
         */
        const marker = m.variant
          ? new Marker({ element: markerElement(m.variant, m.label), anchor: 'center' })
          : new Marker({
              color: m.dimmed ? '#C9CBD1' : '#D8654F',
              opacity: m.dimmed ? '0.5' : '1',
            })
        marker.setLngLat([m.position.lng, m.position.lat])

        if (onMarkerClickRef.current) {
          marker.getElement().style.cursor = 'pointer'
          marker.getElement().addEventListener('click', (e) => {
            /* 不要讓點擊穿透到地圖，否則會順便平移一下 */
            e.stopPropagation()
            onMarkerClickRef.current?.(m.id)
          })
        } else if (m.label && !m.variant) {
          marker.setPopup(new Popup({ offset: 24 }).setText(m.label))
        }

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
