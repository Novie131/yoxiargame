import { useNavigate } from 'react-router'

import { BottomSheet } from '@/components/BottomSheet'
import { MapBackdrop } from '@/components/MapBackdrop'
import {
  CrosshairIcon,
  HomeIcon,
  PencilIcon,
  PlaneIcon,
  SearchIcon,
  StarIcon,
} from '@/components/icons'

/* 對應設計稿 frame：yoxi-booking（叫車 ①／選上車點） */

const shortcuts = [
  { label: '機場接送', Icon: PlaneIcon },
  { label: '回公司', Icon: HomeIcon },
  { label: '常用地點', Icon: StarIcon },
]

export function BookingScreen() {
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col">
      <MapBackdrop>
        <div className="absolute inset-x-4 top-3">
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-full bg-surface px-4 py-3.5 text-left shadow-[0_3px_14px_rgba(22,32,55,.16)]"
          >
            <SearchIcon />
            <span className="text-[16px] text-subtle">你要去哪裡？</span>
          </button>
        </div>

        <button
          type="button"
          aria-label="回到目前位置"
          className="absolute bottom-4 right-4 flex h-11 w-11 items-center justify-center rounded-full bg-surface shadow-[0_3px_14px_rgba(22,32,55,.18)]"
        >
          <CrosshairIcon />
        </button>
      </MapBackdrop>

      <BottomSheet>
        <div className="flex items-start gap-3">
          <span className="mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[12px] text-subtle">目前上車位置</p>
            <p className="text-[17px] font-bold">大安區新生南路三段22巷2-3號</p>
          </div>
          <button type="button" aria-label="編輯上車位置" className="mt-1.5 shrink-0">
            <PencilIcon />
          </button>
        </div>

        <div className="mt-3.5 flex gap-2">
          {shortcuts.map(({ label, Icon }) => (
            <button
              key={label}
              type="button"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-line/60 py-2.5 text-[13px] font-medium"
            >
              <Icon />
              {label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => navigate('/ride/estimate')}
          className="mt-3.5 w-full rounded-xl bg-primary py-4 text-[18px] font-bold text-white transition-transform active:scale-[.98]"
        >
          呼叫 yoxi
        </button>
      </BottomSheet>
    </div>
  )
}
