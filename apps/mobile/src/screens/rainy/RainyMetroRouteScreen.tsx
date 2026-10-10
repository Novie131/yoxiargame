import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'

import { formatFare } from '@/lib/ride'
import {
  addMinutes,
  outdoorWalkMinutes,
  RAINY_SCENARIO,
  useRainyCommute,
} from '@/lib/rainyCommute'
import type { MetroOption } from '@/lib/tripOptions'

import {
  Card,
  FlagIcon,
  MetroIcon,
  RainyHeader,
  RainyPage,
  SecondaryButton,
  Tag,
  TransferIcon,
  UmbrellaIcon,
  WalkIcon,
} from './parts'

/*
 * 對應設計稿 frame：捷運路線（Figma 499:2039）
 *
 * 設計稿的路段是 A 站 → B 轉乘站 → C 目的站的示意（42 分鐘、NT$40、轉乘 1 次）。
 * 這裡換成 /trip/options 回來的真實規劃：起訖站、每段路線與分鐘數、轉乘次數、
 * TDX 公告票價都是真的；只有「08:00 出發」是情境時間，抵達時間由它推算並標示「示意」。
 *
 * 轉乘的分鐘數後端沒有逐段拆開（plan.totalMinutes 已含轉乘步行與等車），
 * 所以轉乘那一列只寫站名，不編一個分鐘數。
 */

type Step = {
  key: string
  icon: ReactNode
  tone: 'outdoor' | 'indoor'
  title: string
  detail: string
  minutes: string
  outdoor?: boolean
}

function stepsOf(metro: MetroOption, arrive: string): Step[] {
  const { plan, fromStation, toStation } = metro
  const steps: Step[] = [
    {
      key: 'walk-in',
      icon: <WalkIcon />,
      tone: 'outdoor',
      title: '步行至起點站',
      detail: `出發地 → ${fromStation.name}站`,
      minutes: `${fromStation.walkMinutes} 分鐘`,
      outdoor: true,
    },
  ]

  plan.legs.forEach((leg, i) => {
    if (i > 0) {
      steps.push({
        key: `transfer-${i}`,
        icon: <TransferIcon />,
        tone: 'indoor',
        title: '站內轉乘',
        detail: `${leg.from}站・依轉乘指標前往${leg.line}月台`,
        minutes: '',
      })
    }
    steps.push({
      key: `leg-${i}`,
      icon: <MetroIcon className="h-[18px] w-[18px]" />,
      tone: 'indoor',
      title: `搭乘${leg.line}`,
      detail: `${leg.from} → ${leg.to}・${leg.stops} 站`,
      minutes: `${leg.minutes} 分鐘`,
    })
  })

  steps.push(
    {
      key: 'walk-out',
      icon: <WalkIcon />,
      tone: 'outdoor',
      title: '出站步行至公司',
      detail: `${toStation.name}站 → 目的地`,
      minutes: `${toStation.walkMinutes} 分鐘`,
      outdoor: true,
    },
    {
      key: 'arrive',
      icon: <FlagIcon className="h-[18px] w-[18px]" />,
      tone: 'indoor',
      title: '抵達公司',
      detail: '抵達時間由情境出發時間推算',
      minutes: `約 ${arrive}`,
    },
  )
  return steps
}

export function RainyMetroRouteScreen() {
  const navigate = useNavigate()
  const { from, to, configured, ride, metro } = useRainyCommute()

  const option = metro.status === 'ready' ? metro.option : null
  const arrive = option ? addMinutes(RAINY_SCENARIO.time, option.totalMinutes) : null

  return (
    <RainyPage>
      <RainyHeader
        back="返回通勤推薦"
        backTo="/rainy/commute"
        title="捷運路線"
        subtitle="雨天替代方案・車資較省"
      />

      <Card className="mt-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[18px] font-bold">家 → 公司</h2>
          <Tag>{configured ? '常用路線' : '示範路線'}</Tag>
        </div>
        {option ? (
          <>
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              <MiniStat label="總時間・預估" value={`約 ${option.totalMinutes} 分鐘`} />
              <MiniStat
                label="車資・票價"
                value={option.fare ? `約 NT$${option.fare.singleJourney}` : '—'}
              />
              <MiniStat
                label="轉乘"
                value={option.plan.transfers > 0 ? `${option.plan.transfers} 次` : '直達'}
              />
            </div>
            <p className="mt-2.5 text-[12px] text-muted">
              今天 {RAINY_SCENARIO.time} 出發・約 {arrive} 抵達（示意）
            </p>
          </>
        ) : (
          <p className="mt-2.5 text-[14px] text-muted">
            {metro.status === 'loading' ? '查詢捷運路線中…' : `查不到 ${from} → ${to} 的捷運路線。`}
          </p>
        )}
        <p className="mt-2 text-[13px] text-ink-2">
          {from} → {to}・{RAINY_SCENARIO.temperatureC}°C {RAINY_SCENARIO.condition}・降雨機率{' '}
          {RAINY_SCENARIO.rainChance}%（情境示範）
        </p>
      </Card>

      {option && arrive && (
        <>
          <h2 className="mt-5 text-[17px] font-bold">通勤路段</h2>
          <ol className="mt-2 space-y-1">
            {stepsOf(option, arrive).map((s) => (
              <li key={s.key} className="flex gap-3 py-2">
                <span
                  className={[
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                    s.tone === 'outdoor' ? 'bg-primary-tint' : 'bg-surface-3',
                  ].join(' ')}
                >
                  {s.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold">{s.title}</p>
                  <p className="text-[12px] text-muted">{s.detail}</p>
                  {s.outdoor && <p className="text-[12px] text-primary">戶外路段・需撐傘</p>}
                </div>
                {s.minutes && (
                  <span className="shrink-0 text-[13px] font-bold">{s.minutes}</span>
                )}
              </li>
            ))}
          </ol>

          <Card tone="tint" className="mt-3">
            <p className="flex items-center gap-2 text-[15px] font-bold">
              <UmbrellaIcon />
              戶外步行合計約 {outdoorWalkMinutes(option)} 分鐘
            </p>
            <p className="mt-1.5 text-[13px] text-muted">
              雨天進出站時建議撐傘，搭乘{option.plan.transfers > 0 ? '與轉乘' : ''}可在捷運站內完成。
            </p>
          </Card>

          <p className="mt-3 text-[12px] leading-[1.6] text-subtle">
            起訖以常用路線的站名定位，步行時間由直線距離估算；站間時間與票價來自 TDX
            {option.fare ? `（${option.fare.basis}）` : ''}。
          </p>
        </>
      )}

      <div className="mt-3">
        {/*
          * 設計稿寫「設定捷運路線並出發」。設過常用路線的人，「出發」要的是即時班車 ——
          * 那在行程頁（查 TDX 即時狀態）；沒設過的人才需要先去設定。
          */}
        {configured ? (
          <SecondaryButton onClick={() => navigate('/trips')}>查看即時班車並出發</SecondaryButton>
        ) : (
          <SecondaryButton onClick={() => navigate('/commute-setup')}>
            設定捷運路線並出發
          </SecondaryButton>
        )}
      </div>

      <Card tone="tint" className="mt-4">
        <h2 className="text-[16px] font-bold">想少走路？查看 yoxi 費用</h2>
        <p className="mt-1.5 text-[13px] leading-[1.6] text-muted">
          yoxi 門口上車，不需轉乘。
          {ride.status === 'ready'
            ? `車程約 ${ride.data.durationMinutes} 分鐘，${formatFare(ride.data.fare)}（估算）。`
            : ''}
        </p>
        <div className="mt-3">
          <SecondaryButton onClick={() => navigate('/rainy/ride')}>查看 yoxi 費用</SecondaryButton>
        </div>
        <p className="mt-2 text-[12px] text-subtle">下一步查看地點與費用，不會直接叫車。</p>
      </Card>
    </RainyPage>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-subtle">{label}</p>
      <p className="mt-0.5 text-[16px] font-bold max-[359px]:text-[14px]">{value}</p>
    </div>
  )
}
