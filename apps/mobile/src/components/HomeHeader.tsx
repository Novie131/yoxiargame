import { CloudIcon, MoonIcon, RainIcon, SunIcon } from './icons'
import { greeting as greetingFor } from '@/lib/datetime'
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

  const heading = greeting ?? `${greetingFor()}，${displayName}`

  /* 提示卡：外面沒指定就用即時天氣導出的提醒，沒有值得提醒的事就不顯示 */
  const card =
    alert !== undefined ? alert : weather.status === 'ready' ? weather.weather.advice : null

  return (
    <header className="flex items-start justify-between gap-3 px-5 pt-3 pb-4">
      <div className="min-w-0">
        <h1 className="text-[22px] font-bold tracking-tight">{heading}</h1>

        <div className="mt-1 flex items-center gap-1 text-[13px] text-muted">
          {location ? (
            <>
              {location} <SunIcon />
            </>
          ) : weather.status === 'ready' ? (
            <>
              <span>
                {weather.weather.location ?? '目前位置'} {weather.weather.temperatureC}°C
                {weather.weather.condition !== '—' && ` ${weather.weather.condition}`}
              </span>
              <WeatherIcon weather={weather.weather} />
              {/* 定位被拒時給的是台北市中心，要講清楚，不要讓人以為是他所在地 */}
              {!weather.precise && <span className="text-subtle">（未定位）</span>}
            </>
          ) : weather.status === 'loading' ? (
            <span className="text-subtle">取得目前天氣…</span>
          ) : (
            <span className="text-subtle">天氣資料暫時無法取得</span>
          )}
        </div>
      </div>

      {card && (
        <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-surface px-3 py-2 shadow-[0_2px_10px_rgba(22,32,55,.10)]">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-tint">
            <SunIcon />
          </span>
          <div className="leading-tight">
            <p className="text-[13px] font-semibold">{card.title}</p>
            <p className="text-[11px] text-subtle">{card.body}</p>
          </div>
        </div>
      )}
    </header>
  )
}
