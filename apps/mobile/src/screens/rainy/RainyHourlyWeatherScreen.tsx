import { useNavigate } from 'react-router'

import { Avatar } from '@/components/chat'
import { formatFare } from '@/lib/ride'
import { RAINY_HOURLY, RAINY_SCENARIO, useRainyCommute } from '@/lib/rainyCommute'

import {
  Card,
  PinOutlineIcon,
  PrimaryButton,
  RainyHeader,
  RainyPage,
  ShirtIcon,
  Tag,
  UmbrellaIcon,
  WeatherIcon,
} from './parts'

/*
 * 對應設計稿 frame：逐時天氣（Figma 499:2185）
 *
 * 整頁的天氣都是**情境示範**（lib/rainyCommute 的 RAINY_SCENARIO / RAINY_HOURLY）：
 * 後端的 /weather 只有「現在」與八小時摘要，沒有逐時數字；而且這組畫面講的是下雨天，
 * 接即時天氣的話晴天 demo 會出現「雨天通勤：晴 0%」。所以每一塊都掛著示意標籤。
 *
 * 底下「需要現在去公司？」那張的車程與車資是真的估算，跟叫車確認頁、估價頁同一份。
 */

export function RainyHourlyWeatherScreen() {
  const navigate = useNavigate()
  const { from, to, ride } = useRainyCommute()

  return (
    <RainyPage>
      <RainyHeader
        back="返回首頁"
        backTo="/rainy"
        title="逐時天氣"
        subtitle="雨天出行建議・yoxi 優先版本"
      />

      <Card className="mt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-[13px] font-bold">
            <PinOutlineIcon className="h-4 w-4" color="var(--color-ink)" />
            {from}・今天 {RAINY_SCENARIO.time}
          </p>
          <Tag>情境示範</Tag>
        </div>
        <div className="mt-2 flex items-end justify-between">
          <p className="flex items-baseline gap-2">
            <span className="text-[52px] font-bold leading-none">{RAINY_SCENARIO.temperatureC}°</span>
            <span className="text-[20px] font-bold">{RAINY_SCENARIO.condition}</span>
          </p>
          <WeatherIcon kind="rain" size={48} color="var(--color-primary)" />
        </div>
        <p className="mt-3 text-[13px] text-muted">
          體感 {RAINY_SCENARIO.feelsLikeC}°C ｜ 降雨機率 {RAINY_SCENARIO.rainChance}%
        </p>
        <p className="mt-2 text-[11px] text-subtle">天氣資料更新 {RAINY_SCENARIO.updatedAt}（示意）</p>
      </Card>

      <div className="mt-3 flex gap-3 rounded-card bg-primary-tint/70 p-3.5">
        <Avatar emoji="🦎" ring="var(--color-warning-tint)" />
        <div className="min-w-0">
          <p className="text-[13px] font-bold">先看雨勢，再決定出門時間</p>
          <p className="mt-1 text-[13px] leading-[1.6] text-ink-2">
            示意預報中 08:00–10:00 降雨機率較高。若需要此時出門，請隨身帶傘；未來雨勢仍以實際預報為準。
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-[17px] font-bold">今天的逐時預報</h2>
        <Tag>情境示意</Tag>
      </div>
      <table className="mt-2 w-full border-separate border-spacing-y-1 text-[13px]">
        <thead>
          <tr className="text-[11px] text-subtle">
            <th className="px-3 py-1 text-left font-normal">時間</th>
            <th className="py-1 text-left font-normal">天氣</th>
            <th className="py-1 text-right font-normal">氣溫</th>
            <th className="px-3 py-1 text-right font-normal">降雨</th>
          </tr>
        </thead>
        <tbody>
          {RAINY_HOURLY.map((h, i) => {
            const now = i === 0
            return (
              <tr key={h.time} className={now ? 'bg-primary-tint/70' : 'bg-surface'}>
                <td className={`rounded-l-lg px-3 py-2.5 ${now ? 'font-bold' : ''}`}>{h.time}</td>
                <td className="py-2.5">
                  <span className="flex items-center gap-1.5">
                    <WeatherIcon
                      kind={h.kind}
                      size={18}
                      color={now ? 'var(--color-primary)' : 'var(--color-ink)'}
                    />
                    {h.label}
                  </span>
                </td>
                <td className="py-2.5 text-right">{h.temperatureC}°C</td>
                <td
                  className={`rounded-r-lg px-3 py-2.5 text-right font-bold ${now ? 'text-primary' : ''}`}
                >
                  {h.rainChance}%
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[11px] leading-[1.6] text-subtle">
        整張表為雨天情境的示意預報，非即時查詢，不代表實際天氣走勢。
      </p>

      <Card className="mt-4">
        <h2 className="text-[16px] font-bold">出門前，準備這些就好</h2>
        <p className="mt-2 flex items-center gap-2 text-[13px]">
          <ShirtIcon className="shrink-0" />
          {RAINY_SCENARIO.outfit}
        </p>
        <p className="mt-1.5 flex items-center gap-2 text-[13px]">
          <UmbrellaIcon className="shrink-0" />
          即使搭車，上下車仍需撐傘；濕滑路面放慢腳步。
        </p>
      </Card>

      <Card tone="tint" className="mt-4">
        <h2 className="text-[16px] font-bold">需要現在去公司？</h2>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-muted">
          {from} → {to}・yoxi 門到門通勤，省去轉乘。
          {ride.status === 'ready'
            ? `車程約 ${ride.data.durationMinutes} 分鐘，${formatFare(ride.data.fare)}（估算）。`
            : ''}
        </p>
        <div className="mt-3">
          <PrimaryButton onClick={() => navigate('/rainy/ride')}>查看 yoxi 費用</PrimaryButton>
        </div>
        <p className="mt-2 text-[12px] text-subtle">
          想少走路可考慮 yoxi；下一步確認地點與費用，不會直接叫車。
        </p>
        <button
          type="button"
          onClick={() => navigate('/rainy/commute')}
          className="mx-auto mt-1 block min-h-10 px-2 text-[13px] font-bold text-primary"
        >
          查看通勤推薦與捷運比較 →
        </button>
      </Card>
    </RainyPage>
  )
}
