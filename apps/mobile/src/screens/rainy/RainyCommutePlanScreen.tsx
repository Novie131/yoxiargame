import { useNavigate, useSearchParams } from 'react-router'

import { Avatar } from '@/components/chat'
import { formatFare } from '@/lib/ride'
import {
  COMMUTE_PREFS,
  getLastPref,
  isCommutePref,
  outdoorWalkMinutes,
  RAINY_SCENARIO,
  rememberPref,
  useRainyCommute,
  type CommutePref,
  type RainyCommute,
} from '@/lib/rainyCommute'

import {
  CarOutlineIcon,
  Card,
  MetroIcon,
  PrimaryButton,
  RainyHeader,
  RainyPage,
  SecondaryButton,
  Stat,
  Tag,
  UmbrellaIcon,
} from './parts'

/*
 * 對應設計稿 frame：雨天通勤（Figma 499:1800）
 *
 * 首頁雨天提醒（/rainy）進來的比較頁：yoxi 與捷運並排，由使用者的偏好決定誰在前面。
 *
 * 設計稿上的數字（30–40 分鐘、NT$350–450、捷運 42 分鐘 NT$40）全部換成真的：
 * 叫車用估價頁同一支估算，捷運用 TDX。原因跟 RainyCommuteScreen 的檔頭一樣 ——
 * 這頁寫 NT$350–450、下一頁估價算出 NT$445，demo 時兩個畫面會互相打臉。
 *
 * 三顆偏好 chip 是真的：會換推薦文字、換卡片順序、換哪一張是主色。
 * 「省時間」依實際分鐘數比，捷運比較快就推捷運 —— 不推叫車的時候要敢講。
 */

const ESTIMATE_TAG = '估算值'

/*
 * 「省時間」比較時替叫車補的等車分鐘數。估價只算車程，捷運的總時間卻含步行；
 * 不補的話叫車永遠贏在起跑點。5 分鐘取設計稿「等候 5–8 分鐘」的下界。
 */
const RIDE_WAIT_ALLOWANCE = 5

type Pick = 'ride' | 'metro'

/** 依偏好挑出推薦的那一個，以及一句理由 */
function recommend(pref: CommutePref, data: RainyCommute): { pick: Pick; text: string } {
  const { ride, metro } = data
  const rideReady = ride.status === 'ready' ? ride.data : null
  const metroReady = metro.status === 'ready' ? metro.option : null

  if (pref === 'walk' || !metroReady) {
    return {
      pick: 'ride',
      text:
        pref === 'walk'
          ? '少走路優先：推薦 yoxi，減少雨天步行與轉乘。若優先省預算，可查看捷運。'
          : metro.status === 'loading'
            ? '捷運路線查詢中，先列出 yoxi。'
            : '這段查不到合適的捷運路線，先列出 yoxi。',
    }
  }

  if (pref === 'budget') {
    return {
      pick: 'metro',
      text: metroReady.fare
        ? `省預算優先：捷運約 NT$${metroReady.fare.singleJourney}${
            rideReady ? `，yoxi 約 ${formatFare(rideReady.fare)}` : ''
          }。進出站需撐傘。`
        : '省預算優先：推薦捷運；進出站需撐傘。',
    }
  }

  /* 省時間：照實際分鐘數比。叫車的車程不含等車，所以要先補上等車時間再比 */
  if (!rideReady) return { pick: 'ride', text: '叫車估價計算中，稍後比較時間。' }
  const rideFaster = rideReady.durationMinutes + RIDE_WAIT_ALLOWANCE < metroReady.totalMinutes
  return rideFaster
    ? {
        pick: 'ride',
        text: `省時間優先：yoxi 車程約 ${rideReady.durationMinutes} 分鐘，捷運約 ${metroReady.totalMinutes} 分鐘，推薦 yoxi。`,
      }
    : {
        pick: 'metro',
        text: `省時間優先：捷運約 ${metroReady.totalMinutes} 分鐘，yoxi 車程約 ${rideReady.durationMinutes} 分鐘還要等車，推薦捷運。`,
      }
}

export function RainyCommutePlanScreen() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const raw = params.get('pref')
  const pref: CommutePref = isCommutePref(raw) ? raw : getLastPref()

  const data = useRainyCommute()
  const { from, to, configured, ride, metro } = data
  const { pick, text } = recommend(pref, data)

  const choose = (next: CommutePref) => {
    rememberPref(next)
    setParams({ pref: next }, { replace: true })
  }

  const rideCard = (
    <Card key="ride" tone={pick === 'ride' ? 'primary' : 'plain'}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[24px] font-bold leading-none">
          <CarOutlineIcon />
          yoxi
        </h3>
        <Tag>{pref === 'time' && pick === 'ride' ? '較快' : '雨天推薦'}</Tag>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat
          label="車程・預估"
          value={ride.status === 'ready' ? `約 ${ride.data.durationMinutes} 分鐘` : '—'}
        />
        <Stat
          label="車資・預估"
          value={ride.status === 'ready' ? formatFare(ride.data.fare) : '—'}
        />
      </div>
      <p className="mt-2.5 text-[14px] leading-[1.6] text-muted">
        {ride.status === 'ready'
          ? `約 ${ride.data.distanceKm} 公里，門口上車、不需轉乘。`
          : ride.status === 'error'
            ? '估價暫時取不到，可到下一步再試。'
            : '估算中…'}
        <br />
        上下車仍需撐傘。
      </p>
      <div className="mt-3">
        {pick === 'ride' ? (
          <PrimaryButton onClick={() => navigate('/rainy/ride')}>查看費用並確認叫車</PrimaryButton>
        ) : (
          <SecondaryButton onClick={() => navigate('/rainy/ride')}>查看費用並確認叫車</SecondaryButton>
        )}
      </div>
      <p className="mt-2 text-[12px] text-subtle">下一步確認上車地點與費用，尚未送出叫車。</p>
    </Card>
  )

  const metroCard = (
    <Card key="metro" tone={pick === 'metro' ? 'primary' : 'plain'}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[20px] font-bold leading-none">
          <MetroIcon />
          捷運
        </h3>
        <Tag>{pref === 'time' && pick === 'metro' ? '較快' : '車資較省'}</Tag>
      </div>
      {metro.status === 'ready' ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Stat label="總時間・預估" value={`約 ${metro.option.totalMinutes} 分鐘`} />
            <Stat
              label="車資・票價"
              value={metro.option.fare ? `約 NT$${metro.option.fare.singleJourney}` : '—'}
            />
          </div>
          <p className="mt-2.5 text-[14px] font-semibold">
            步行約 {outdoorWalkMinutes(metro.option)} 分鐘・
            {metro.option.plan.transfers > 0 ? `轉乘 ${metro.option.plan.transfers} 次` : '不需轉乘'}
          </p>
          <p className="mt-2 text-[14px] text-muted">省預算可選捷運；進出站需撐傘。</p>
        </>
      ) : (
        <p className="mt-3 text-[14px] text-muted">
          {metro.status === 'loading' ? '捷運路線查詢中…' : '這段查不到合適的捷運路線。'}
        </p>
      )}
      <div className="mt-3">
        {pick === 'metro' ? (
          <PrimaryButton onClick={() => navigate('/rainy/metro')}>查看捷運路線</PrimaryButton>
        ) : (
          <SecondaryButton onClick={() => navigate('/rainy/metro')} disabled={metro.status !== 'ready'}>
            查看捷運路線
          </SecondaryButton>
        )}
      </div>
    </Card>
  )

  return (
    <RainyPage>
      <RainyHeader
        back="返回首頁"
        backTo="/rainy"
        title="雨天通勤"
        subtitle="yoxi 優先推薦・少步行，更從容"
      />

      <Card className="mt-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[18px] font-bold">家 → 公司</h2>
          <Tag>{configured ? '常用路線' : '示範路線'}</Tag>
        </div>
        <p className="mt-1.5 text-[14px] text-muted">
          {from} → {to}・今天 {RAINY_SCENARIO.time}
        </p>
        <p className="mt-0.5 text-[14px] text-muted">
          {RAINY_SCENARIO.temperatureC}°C {RAINY_SCENARIO.condition}・降雨機率{' '}
          {RAINY_SCENARIO.rainChance}%（情境示範）
        </p>
      </Card>

      <div className="mt-3 flex gap-2" role="radiogroup" aria-label="通勤偏好">
        {COMMUTE_PREFS.map(({ id, label }) => {
          const on = pref === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => choose(id)}
              className={[
                'min-h-10 rounded-lg px-3.5 text-[14px] font-semibold transition-colors',
                on ? 'bg-primary text-white' : 'bg-surface text-ink',
              ].join(' ')}
            >
              {label}
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex gap-3 rounded-card bg-primary-tint/70 p-3.5">
        <Avatar emoji="🦎" ring="var(--color-warning-tint)" />
        <div className="min-w-0">
          <p className="text-[13px] font-bold">依你的通勤偏好推薦</p>
          <p className="mt-1 text-[14px] leading-[1.6] text-ink-2" aria-live="polite">
            {text}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <h2 className="text-[18px] font-bold">今天，少淋一點雨</h2>
        <Tag>{ESTIMATE_TAG}</Tag>
      </div>

      <div className="mt-3 space-y-3">
        {pick === 'ride' ? [rideCard, metroCard] : [metroCard, rideCard]}
      </div>

      <p className="mt-3 text-[12px] leading-[1.6] text-subtle">
        {ride.status === 'ready' ? `叫車${ride.data.basis}，不含等車時間。` : ''}
        {metro.status === 'ready' && metro.option.fare
          ? `捷運時間與票價來自 TDX（${metro.option.fare.basis}）。`
          : ''}
        天氣為雨天情境示範，非即時資料。
      </p>

      <p className="mt-3 flex items-center gap-2 text-[14px]">
        <UmbrellaIcon />
        {RAINY_SCENARIO.outfit}
      </p>

      <button
        type="button"
        onClick={() => navigate('/rainy/weather')}
        className="mx-auto mt-3 block min-h-11 px-3 text-[15px] font-bold text-primary"
      >
        查看逐時天氣 →
      </button>
    </RainyPage>
  )
}
