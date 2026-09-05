import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { BottomSheet } from '@/components/BottomSheet'
import { MapBackdrop } from '@/components/MapBackdrop'
import { CarIcon, ChevronLeftIcon, CrosshairIcon } from '@/components/icons'

/*
 * 對應設計稿 frame：yoxi-ride-estimate（叫車 ②／預估車資）。此頁無 tab bar
 *
 * 下車地點會從網址參數帶入 —— 探索頁的任務面板按「叫車前往」時會帶著
 * 任務名稱與座標過來，那就是「精準導流」實際落地的地方。沒有帶參數時
 * 沿用設計稿的示範地點。
 *
 * 車程、抵達時間、車資仍是設計稿的數字：目前沒有接任何叫車估價來源。
 */

const stats = [
  { label: '預估車程', value: '約 15 分鐘' },
  { label: '預估抵達', value: '14:25' },
  { label: '預估車資', value: 'NT$ 250-320', highlight: true },
]

const carTypes = [
  { id: 'sedan', name: '轎車', note: '最快' },
  { id: 'suv', name: 'SUV', note: '寬敞' },
  { id: 'premium', name: '多元車', note: '高級' },
]

export function EstimateScreen() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [selected, setSelected] = useState('sedan')

  /* 從探索頁導流過來時帶著任務名稱；沒有就用設計稿的示範地點 */
  const destination = params.get('to')?.trim() || '台北松山機場'

  return (
    <div className="flex h-full flex-col">
      <MapBackdrop>
        <button
          type="button"
          aria-label="返回"
          onClick={() => navigate('/ride/booking')}
          className="absolute left-4 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-[0_3px_14px_rgba(22,32,55,.18)]"
        >
          <ChevronLeftIcon />
        </button>

        <button
          type="button"
          aria-label="回到目前位置"
          className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-[0_3px_14px_rgba(22,32,55,.18)]"
        >
          <CrosshairIcon />
        </button>
      </MapBackdrop>

      <BottomSheet>
        <div className="flex items-baseline justify-between">
          <h1 className="text-[20px] font-bold">預估車資</h1>
          <span className="text-[13px] font-medium text-primary">已套用優惠券</span>
        </div>

        <div className="relative mt-3 space-y-3 rounded-2xl bg-surface-2 p-3.5">
          <span className="absolute left-[10px] top-7 h-8 w-px bg-line" />
          <div className="flex gap-3">
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-success" />
            <div className="-mt-1">
              <p className="text-[12px] text-subtle">上車地點</p>
              <p className="text-[15px] font-semibold">大安區新生南路三段22巷2-3號</p>
            </div>
          </div>
          <div className="border-t border-black/[.06] pt-3">
            <div className="flex gap-3">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
              <div className="-mt-1">
                <p className="text-[12px] text-subtle">下車地點</p>
                <p className="text-[15px] font-semibold">{destination}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {stats.map(({ label, value, highlight }) => (
            <div
              key={label}
              className={[
                'rounded-xl py-2.5 text-center',
                highlight
                  ? 'border border-primary bg-primary-tint'
                  : 'bg-surface-2',
              ].join(' ')}
            >
              <p className="text-[11px] text-subtle">{label}</p>
              <p
                className={[
                  'mt-0.5 text-[15px] font-bold',
                  highlight ? 'text-primary' : '',
                ].join(' ')}
              >
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {carTypes.map(({ id, name, note }) => {
            const on = selected === id
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSelected(id)}
                aria-pressed={on}
                className={[
                  'flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-colors',
                  on ? 'bg-ink text-white' : 'border border-line/60',
                ].join(' ')}
              >
                <CarIcon active={on} />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold">{name}</span>
                  <span
                    className={[
                      'block text-[11px]',
                      on ? 'text-primary-soft' : 'text-subtle',
                    ].join(' ')}
                  >
                    {note}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* 設計稿上沒有這顆 CTA（畫面在車型列之後就結束了），
            但原型需要能往下一步走，所以補上。之後對到設計再調整。 */}
        <button
          type="button"
          onClick={() => navigate('/ride/driver')}
          className="mt-3 w-full rounded-xl bg-primary py-4 text-[17px] font-bold text-white transition-transform active:scale-[.98]"
        >
          確認叫車
        </button>
      </BottomSheet>
    </div>
  )
}
