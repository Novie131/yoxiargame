import { BottomSheet } from '@/components/BottomSheet'
import { MapBackdrop } from '@/components/MapBackdrop'
import { AlertIcon, ShieldIcon } from '@/components/icons'

/* 對應設計稿 frame：yoxi-trip-in-progress（叫車 ④／行程進行中） */

export function TripInProgressScreen() {
  return (
    <div className="flex h-full flex-col">
      <MapBackdrop>
        <div className="absolute inset-x-4 top-3 flex items-center justify-between rounded-full bg-surface px-4 py-3 shadow-[0_3px_14px_rgba(22,32,55,.14)]">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-primary" />
            行程進行中
          </span>
          <span className="text-[15px] font-bold text-primary">安全行駛中</span>
        </div>
      </MapBackdrop>

      <BottomSheet>
        <div>
          <p className="text-[12px] text-subtle">目的地</p>
          <p className="mt-0.5 flex items-center gap-2 text-[20px] font-bold">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
            台北101 (Taipei 101)
          </p>
          <p className="mt-0.5 pl-[18px] text-[13px] text-subtle">
            信義區信義路五段7號
          </p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-black/[.06] pt-3">
          <div className="rounded-xl bg-primary-tint px-3.5 py-3">
            <p className="text-[12px] text-subtle">預計抵達</p>
            <p className="mt-0.5 text-[20px] font-bold">12 分鐘</p>
          </div>
          <div className="rounded-xl bg-primary-tint px-3.5 py-3">
            <p className="text-[12px] text-subtle">預估費用</p>
            <p className="mt-0.5 text-[20px] font-bold text-primary">NT$285</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <button
            type="button"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-primary py-3.5 text-[15px] font-semibold text-primary"
          >
            <ShieldIcon />
            安全分享
          </button>
          <button
            type="button"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-primary py-3.5 text-[15px] font-semibold text-primary"
          >
            <AlertIcon />
            緊急求助
          </button>
        </div>
      </BottomSheet>
    </div>
  )
}
