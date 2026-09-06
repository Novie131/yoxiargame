import { CloudIcon, MoonIcon, RainIcon, SunIcon } from './icons'
import { greeting as greetingFor } from '@/lib/datetime'
import { clearManualLocation, requestLocation, useLocationState } from '@/lib/location'
import { useMember } from '@/lib/member'
import { useWeather, type Weather } from '@/lib/weather'

/*
 * 三張首頁稿共用的標題列：問候 + 天氣，右側是情境提示卡。
 *
 * 不傳 props 時走即時資料：問候語看現在幾點、名字看會員、天氣看定位。
 * 設計稿還原用的畫面（雨天、紫外線）照舊傳固定值蓋掉，才對得上稿。
 */

function WeatherIcon({ weather }: { weather: Weather }) {
  if (weather.precipitationMm > 0) return <RainIcon />
  if (!weather.isDay) return <MoonIcon />
  if (weather.condition.includes('雲') || weather.condition === '陰') return <CloudIcon />
  return <SunIcon />
}

export function HomeHeader({
  greeting,
  location,
  alert,
}: {
  greeting?: string
  location?: string
  alert?: { title: string; body: string } | null
}) {
  const { displayName } = useMember()
  const weather = useWeather()
  const { status } = useLocationState()

  const heading = greeting ?? `${greetingFor()}，${displayName}`

  /* 提示卡：外面沒指定就用即時天氣導出的提醒，沒有值得提醒的事就不顯示 */
  const card =
    alert !== undefined ? alert : weather.status === 'ready' ? weather.weather.advice : null

  return (
    <header className="px-5 pt-3 pb-4">
      {/*
        * 提示卡不能是 shrink-0：它的內文是動態的（「約 01:00 起降雨機率 35%，
        * 建議帶傘」比原本的「記得帶傘」長得多），不讓它退讓的話會把左邊那欄
        * 壓到零寬，地名跟溫度就會被擠成一個字一行（實際發生過）。
        * 所以給它上限並讓內文自己截斷。
        */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-bold tracking-tight">{heading}</h1>

          {/* 不換行 + 溢出省略：地名、溫度、天氣三段加起來很容易超過寬度 */}
          <div className="mt-1 flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden text-[13px] text-muted">
            {location ? (
              <>
                {location} <SunIcon />
              </>
            ) : weather.status === 'ready' ? (
              <>
                <span className="min-w-0 truncate">
                  {weather.weather.location ?? '目前位置'} {weather.weather.temperatureC}°C
                  {weather.weather.condition !== '—' && ` ${weather.weather.condition}`}
                </span>
                <span className="shrink-0">
                  <WeatherIcon weather={weather.weather} />
                </span>
              </>
            ) : weather.status === 'loading' ? (
              <span className="text-subtle">取得目前天氣…</span>
            ) : (
              <span className="text-subtle">天氣資料暫時無法取得</span>
            )}
          </div>
        </div>

        {card && (
          <div className="flex max-w-[52%] items-center gap-2 rounded-2xl bg-surface px-3 py-2 shadow-[0_2px_10px_rgba(22,32,55,.10)]">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-tint">
              <SunIcon />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-semibold">{card.title}</p>
              <p className="truncate text-[11px] text-subtle">{card.body}</p>
            </div>
          </div>
        )}
      </div>

      {/*
        * 定位狀態獨立一行。
        *
        * 塞進上面那行天氣裡會跟地名搶寬度，兩邊都被截斷（踩過）。而且這件事
        * 本來就值得一整行：顯示的地名是臺北市中心的退路座標，不是使用者所在地，
        * 不講清楚就是在騙他。
        *
        * 被拒絕過就不要再給「開啟定位」按鈕 —— 瀏覽器不會再問第二次，
        * 按了沒反應比沒有按鈕更糟。那種情況指路去對話裡手動指定。
        */}
      {!location && weather.status === 'ready' && !weather.precise && (
        <div className="mt-1 text-[12px]">
          {status === 'manual' ? (
            <button
              type="button"
              onClick={clearManualLocation}
              className="text-subtle underline underline-offset-2"
            >
              目前是手動指定的位置，改用定位
            </button>
          ) : status === 'denied' ? (
            <span className="text-subtle">未定位——可以在下面的對話裡直接說你在哪</span>
          ) : (
            <button
              type="button"
              onClick={() => void requestLocation()}
              className="text-subtle underline underline-offset-2"
            >
              未定位，點這裡開啟定位
            </button>
          )}
        </div>
      )}
    </header>
  )
}
