/*
 * 地圖的共用設定。
 *
 * 圖磚用 OpenFreeMap：開源、不需要金鑰、沒有按次計費。
 * 這是刻意的選擇 —— Google Maps 與 Mapbox 都要綁信用卡並依請求數計價，
 * 對一個還在驗證方向的產品來說，那是不該現在扛的固定成本。
 * 底圖資料是 OpenStreetMap，樣式本身已經帶了必要的姓名標示，
 * MapLibre 會自動顯示在右下角，不要把它拿掉（那是授權條件）。
 *
 * 之後若要換供應商（自架 Protomaps、或改用商業服務），只要改這裡的 STYLE_URL。
 */

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

export type Coordinate = { lng: number; lat: number }

export type CityPreset = {
  id: string
  name: string
  center: Coordinate
  /** 這個縮放層級大致涵蓋一個直轄市的市區範圍 */
  zoom: number
}

/*
 * 目前先做三個城市當範例。座標取市中心（車站或市政府一帶），
 * zoom 11 大約是「看得到整個市區、也還讀得到主要道路與區名」的層級。
 *
 * 新北市的市域包住台北市、範圍又特別大，所以再拉遠一級；
 * 用板橋（市政府所在）當中心而不是幾何中心 —— 幾何中心會落在山區。
 */
export const CITIES: CityPreset[] = [
  { id: 'taipei', name: '台北', center: { lng: 121.5445, lat: 25.0553 }, zoom: 11 },
  { id: 'newtaipei', name: '新北', center: { lng: 121.4657, lat: 25.0121 }, zoom: 10.3 },
  { id: 'taichung', name: '台中', center: { lng: 120.6736, lat: 24.1577 }, zoom: 11 },
]

/*
 * 台灣本島的範圍，用來擋住把地圖拖到太平洋中間。
 * 含離島的話東西向要拉到 118（金門），但那會讓一般操作的手感變鬆散，
 * 等真的要支援離島時再放寬。
 */
export const TAIWAN_BOUNDS: [number, number, number, number] = [119.3, 21.7, 122.2, 25.4]
