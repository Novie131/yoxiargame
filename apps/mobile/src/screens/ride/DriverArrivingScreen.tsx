import { useNavigate } from 'react-router'

import { BottomSheet } from '@/components/BottomSheet'
import { MapBackdrop } from '@/components/MapBackdrop'
import {
  ChatIcon,
  CrosshairIcon,
  MemberIcon,
  PhoneIcon,
  StarIcon,
  TaxiIcon,
} from '@/components/icons'

/* 對應設計稿 frame：yoxi-driver-arriving（叫車 ③／司機前往中） */

export function DriverArrivingScreen() {
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col">
      <MapBackdrop>
        {/* 真實流程是司機抵達後自動進入行程中。原型裡點這條狀態列代替。 */}
        <button
          type="button"
          onClick={() => navigate('/ride/trip')}
          className="absolute inset-x-4 top-3 flex items-center justify-center gap-2 rounded-full border border-primary bg-surface px-4 py-3 shadow-[0_3px_14px_rgba(22,32,55,.14)]"
        >
          <TaxiIcon />
          <span className="text-[15px] font-semibold text-primary">
            司機前往中・預計 3 分鐘後抵達
          </span>
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
        <div className="flex items-center gap-3.5 rounded-2xl bg-surface-2 p-3.5">
          {/* 設計稿是司機大頭照。真實資料會由 API 帶回，這裡先放佔位 */}
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-4">
            <MemberIcon />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[17px] font-bold">
              陳建宏 司機
              <StarIcon active />
              <span className="text-[14px]">4.9</span>
            </p>
            <p className="mt-0.5 text-[13px] text-muted">TOYOTA RAV4（白色）</p>
            <span className="mt-1.5 inline-block rounded-md bg-primary-tint px-2 py-1 text-[13px] font-bold text-primary">
              TDA-8899
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl border border-line/60 py-3.5 text-[15px] font-medium"
          >
            <ChatIcon />
            傳送訊息
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-2 rounded-xl border border-line/60 py-3.5 text-[15px] font-medium"
          >
            <PhoneIcon />
            撥打電話
          </button>
        </div>

        <div className="mt-3 border-t border-black/[.06] pt-3 text-center">
          <button
            type="button"
            onClick={() => navigate('/ride/booking')}
            className="text-[15px] text-muted underline underline-offset-4"
          >
            取消行程
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
