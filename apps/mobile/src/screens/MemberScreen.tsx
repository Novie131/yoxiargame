import { ChevronLeftIcon, MemberIcon, PinIcon, StarIcon } from '@/components/icons'

/*
 * 會員頁 —— 設計稿未提供，這是依現有設計系統做的提案版。
 *
 * 內容取自已存在的產品線索：
 *   等級與稱號   → 工作區/exploration-home 的「Lv.12 城市探索家」
 *   探索幣       → 工作區/task-ui-container 的「完成後可獲得 100 點探索幣」
 *   任務進度     → 工作區/presentation-task-progress-modes 的 2/5 儀表
 *   常用路線     → 資料庫的 favorite_stations
 *
 * 目前後端沒有身分驗證（一律記為 DEV_USER_REF），所以資料是假的。
 * 接上登入後這頁要改成讀真實使用者資料。
 */

const stats = [
  { label: '完成任務', value: '24' },
  { label: '探索幣', value: '1,250' },
  { label: '走過距離', value: '86 km' },
]

const menu = [
  { label: '我的任務', value: '進行中 3', Icon: StarIcon },
  { label: '收藏地點', value: '12', Icon: PinIcon },
  { label: '行程紀錄', value: '' },
  { label: '兌換紀錄', value: '' },
]

export function MemberScreen() {
  return (
    <div className="min-h-full bg-surface-2 pb-6">
      <header className="bg-surface px-5 pb-5 pt-2">
        <h1 className="text-[26px] font-bold tracking-tight">會員</h1>
      </header>

      <div className="px-4">
        {/* 身分卡 */}
        <div className="mt-4 flex items-center gap-4 rounded-2xl bg-ink px-5 py-4 text-white">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15">
            <MemberIcon />
          </span>
          <div className="min-w-0">
            <p className="text-[19px] font-bold">志明</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-white/75">
              <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                Lv.12
              </span>
              城市探索家
            </p>
          </div>
        </div>

        {/* 數據 */}
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          {stats.map((s) => (
            <div key={s.label} className="rounded-xl bg-surface py-3.5 text-center">
              <p className="text-[20px] font-bold">{s.value}</p>
              <p className="mt-0.5 text-[12px] text-subtle">{s.label}</p>
            </div>
          ))}
        </div>

        {/* 下一級進度 */}
        <div className="mt-3 rounded-2xl bg-surface px-4 py-3.5">
          <div className="flex items-baseline justify-between">
            <p className="text-[14px] font-semibold">距離 Lv.13 還差 350 點</p>
            <p className="text-[13px] font-bold text-primary">1,250 / 1,600</p>
          </div>
          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary-tint"
            role="progressbar"
            aria-valuenow={1250}
            aria-valuemin={0}
            aria-valuemax={1600}
          >
            <span className="block h-full rounded-full bg-primary" style={{ width: '78%' }} />
          </div>
        </div>

        {/* 選單 */}
        <div className="mt-4 divide-y divide-black/[.06] overflow-hidden rounded-2xl bg-surface">
          {menu.map(({ label, value, Icon }) => (
            <button
              key={label}
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
            >
              {Icon && <Icon />}
              <span className="flex-1 text-[15px]">{label}</span>
              {value && <span className="text-[13px] text-subtle">{value}</span>}
              <span className="rotate-180">
                <ChevronLeftIcon />
              </span>
            </button>
          ))}
        </div>
      </div>

      <p className="mt-6 px-5 text-center text-[11px] text-subtle">
        此頁為提案版，尚未取得設計稿；資料為假資料
      </p>
    </div>
  )
}
