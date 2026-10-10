import { useState } from 'react'
import { useNavigate } from 'react-router'

import { PencilIcon } from '@/components/icons'
import { formatFare, trafficLabel } from '@/lib/ride'
import { RAINY_SCENARIO, useRainyCommute } from '@/lib/rainyCommute'

import {
  BuildingIcon,
  CarOutlineIcon,
  Card,
  FlagIcon,
  HouseIcon,
  PinOutlineIcon,
  PrimaryButton,
  RainyHeader,
  RainyPage,
  Tag,
  UmbrellaIcon,
  WalletIcon,
} from './parts'

/*
 * 對應設計稿 frame：yoxi 叫車確認（Figma 499:1916）
 *
 * 雨天通勤頁按「查看費用並確認叫車」先到這裡：把常用路線帶進來、讓使用者確認
 * 上下車點與車型，再進估價頁（/ride/estimate）真正叫車。這一頁**不送出叫車**。
 *
 * 跟設計稿不同的地方：
 *   車資    設計稿寫死 NT$350–450。這裡用估價頁同一支估算、同一組座標，
 *           下一頁看到的數字會一模一樣
 *   等候時間 沒有資料來源（沒有接派車），改顯示距離
 *   地址    設計稿說「地址待設定」。我們的通勤路線存的是站名，所以照實寫「以站名定位」，
 *           鉛筆鈕進通勤路線設定去改
 *   付款「變更」拿掉了 —— 沒有付款流程，放一顆按了沒反應的鈕比不放更糟
 */

const CAR_TYPES = [
  { id: 'sedan', name: '轎車', note: '一般車型' },
  { id: 'suv', name: 'SUV', note: '較寬敞' },
] as const

type CarType = (typeof CAR_TYPES)[number]['id']

export function RainyRideConfirmScreen() {
  const navigate = useNavigate()
  const { from, to, configured, ride, rideHref } = useRainyCommute()
  const [car, setCar] = useState<CarType>('sedan')

  const editRoute = () => navigate('/commute-setup')

  const places = [
    { key: 'pickup', label: '上車地點', name: `家・${from}`, edit: '編輯上車位置', Icon: PinOutlineIcon },
    { key: 'dropoff', label: '下車地點', name: `公司・${to}`, edit: '編輯公司位置', Icon: FlagIcon },
  ]

  return (
    <RainyPage>
      <RainyHeader
        back="返回通勤推薦"
        backTo="/rainy/commute"
        title="yoxi 叫車確認"
        subtitle="雨天通勤・家 → 公司"
      />

      <Card className="mt-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-[16px] font-bold">常用地點已帶入</h2>
          <Tag>{configured ? '來自常用路線' : '示範路線'}</Tag>
        </div>
        <div className="mt-3 flex items-center gap-2" aria-hidden>
          <HouseIcon />
          <span className="h-px flex-1 bg-line/70" />
          <CarOutlineIcon />
          <span className="h-px flex-1 bg-line/70" />
          <BuildingIcon />
        </div>
        <p className="mt-3 text-[13px] text-muted">
          家 → 公司・今天 {RAINY_SCENARIO.time}
        </p>
        <p className="mt-0.5 text-[13px] text-muted">
          上下車點以站名帶入；下一步依實際座標估算車資。
        </p>
      </Card>

      <h2 className="mt-5 text-[17px] font-bold">確認上車位置與目的地</h2>
      <div className="mt-1 divide-y divide-black/[.08]">
        {places.map(({ key, label, name, edit, Icon }) => (
          <div key={key} className="flex items-center gap-3 py-3">
            <Icon className="shrink-0" color={key === 'pickup' ? undefined : 'var(--color-primary)'} />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-subtle">{label}</p>
              <p className="truncate text-[16px] font-bold">{name}</p>
              <p className="text-[12px] text-subtle">以站名定位・{edit}</p>
            </div>
            <button
              type="button"
              onClick={editRoute}
              aria-label={edit}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:bg-primary-tint"
            >
              <PencilIcon />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={editRoute}
        className="min-h-10 text-[14px] font-bold text-primary"
      >
        修改常用路線 →
      </button>

      <h2 className="mt-3 text-[17px] font-bold">選擇車型</h2>
      <div className="mt-2 grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="車型">
        {CAR_TYPES.map(({ id, name, note }) => {
          const on = car === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setCar(id)}
              className={[
                'flex items-center gap-2.5 rounded-xl border px-3 py-3 text-left transition-colors',
                on ? 'border-primary bg-primary-tint-2' : 'border-black/[.08] bg-surface',
              ].join(' ')}
            >
              <CarOutlineIcon color={on ? 'var(--color-primary)' : 'var(--color-ink)'} className="h-6 w-6 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold">{name}</span>
                <span className="block text-[12px] text-subtle">{on ? '目前選擇' : note}</span>
              </span>
              {on && <CheckCircle />}
            </button>
          )
        })}
      </div>

      <Card tone="tint" className="mt-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[16px] font-bold">預估車資</h2>
          {/* 估價依「現在」時段算（跟估價頁一致），不是情境的 08:00，所以標明「現在」 */}
          <Tag>{ride.status === 'ready' ? `現在・${trafficLabel(ride.data.traffic)}` : '估算值'}</Tag>
        </div>
        <p className="mt-2 text-[32px] font-bold text-primary">
          {ride.status === 'ready' ? formatFare(ride.data.fare) : ride.status === 'error' ? '—' : '估算中…'}
        </p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[12px] text-subtle">搭乘時間</p>
            <p className="text-[17px] font-bold">
              {ride.status === 'ready' ? `約 ${ride.data.durationMinutes} 分鐘` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[12px] text-subtle">距離</p>
            <p className="text-[17px] font-bold">
              {ride.status === 'ready' ? `約 ${ride.data.distanceKm} 公里` : '—'}
            </p>
          </div>
        </div>
        <p className="mt-2 text-[12px] text-subtle">
          {ride.status === 'ready'
            ? `${ride.data.basis}・依現在時段計費・不含等車時間`
            : ride.status === 'error'
              ? '估價暫時取不到，下一頁會再試一次'
              : '依臺北市公告計程車費率估算'}
        </p>
      </Card>

      <div className="mt-3 flex items-center gap-3 py-1">
        <WalletIcon className="shrink-0" />
        <div>
          <p className="text-[12px] text-subtle">付款方式</p>
          <p className="text-[15px] font-bold">現金・下車付款</p>
        </div>
      </div>

      <Card className="mt-3">
        <p className="flex items-center gap-2 text-[15px] font-bold">
          <UmbrellaIcon />
          找安全、可避雨的位置等候
        </p>
        <p className="mt-1.5 text-[13px] text-muted">請在安全位置等候，勿站在車道；上下車仍需撐傘。</p>
      </Card>

      <p className="mt-3 text-[12px] text-subtle">
        下一步在估價頁確認車資與車型；目前尚未送出叫車。
      </p>
      <div className="mt-2">
        <PrimaryButton onClick={() => navigate(rideHref(car))}>查看費用並確認叫車</PrimaryButton>
      </div>
    </RainyPage>
  )
}

function CheckCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="8.5" stroke="var(--color-primary)" strokeWidth="1.7" />
      <path d="m8.5 12.2 2.4 2.3 4.6-4.8" stroke="var(--color-primary)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
