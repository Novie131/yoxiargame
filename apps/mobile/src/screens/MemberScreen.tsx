import { useNavigate } from 'react-router'

import { ChevronLeftIcon, PinIcon, StarIcon } from '@/components/icons'
import { useMember } from '@/lib/member'

/*
 * 會員頁 —— 設計稿未提供，這是依現有設計系統做的提案版。
 *
 * 內容取自已存在的產品線索：
 *   等級與稱號   → 工作區/exploration-home 的「Lv.12 城市探索家」
 *   探索幣       → 工作區/task-ui-container 的「完成後可獲得 100 點探索幣」
 *   任務進度     → 工作區/presentation-task-progress-modes 的 2/5 儀表
 *   常用路線     → 資料庫的 favorite_stations
 *
 * 目前後端沒有身分驗證（一律記為 DEV_USER_REF），所以統計數字仍是假的。
 * 名稱與頭像已改吃 lib/member 的 store：沒註冊就顯示「陌生人」與預設頭像。
 */

const stats = [
  { label: '完成任務', value: '24' },
  { label: '探索幣', value: '1,250' },
  { label: '走過距離', value: '86 km' },
]

/*
 * 選單。有去處的才接上路由，沒有的標「規劃中」且不能按 ——
 * 跟設定頁同一個原則：一顆按下去什麼都不會發生的列，比沒有這一列更糟。
 *
 * 收藏地點與兌換紀錄背後的功能還不存在（沒有收藏，也沒有點數系統），
 * 留在畫面上是為了保住這頁的資訊架構。
 */
const menu: Array<{
  label: string
  value?: string
  Icon?: typeof StarIcon
  to?: string
  planned?: boolean
}> = [
  { label: '我的任務', Icon: StarIcon, to: '/explore' },
  { label: '收藏地點', Icon: PinIcon, planned: true },
  { label: '行程紀錄', to: '/trips' },
  { label: '兌換紀錄', planned: true },
]

export function MemberScreen() {
  const navigate = useNavigate()
  const { displayName, avatarUrl, registered } = useMember()

  return (
    <div className="min-h-full bg-surface-2 pb-6">
      <header className="bg-surface px-5 pb-5 pt-2">
        <h1 className="text-[26px] font-bold tracking-tight">會員</h1>
      </header>

      <div className="px-4">
        {/* 身分卡 */}
        <div className="mt-4 flex items-center gap-4 rounded-2xl bg-ink px-5 py-4 text-white">
          <img
            src={avatarUrl}
            alt={displayName}
            className="h-14 w-14 shrink-0 rounded-full bg-white/15 object-cover"
          />
          <div className="min-w-0">
            <p className="text-[19px] font-bold">{displayName}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-white/75">
              {registered ? (
                <>
                  <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">
                    Lv.12
                  </span>
                  城市探索家
                </>
              ) : (
                '尚未註冊'
              )}
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
        {/*
          * 標在數字旁邊，不是頁尾。
          * 頁尾那行小字要捲到底才看得到，而這三個數字是這頁最醒目的東西 ——
          * demo 時最容易被當成真的就是它們。
          */}
        <p className="mt-1.5 text-center text-[11px] text-subtle">
          示範數值・完成任務與點數尚未實作，需要先有登入機制
        </p>

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
          {menu.map(({ label, value, Icon, to, planned }) => (
            <button
              key={label}
              type="button"
              onClick={to ? () => navigate(to) : undefined}
              disabled={!to}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left disabled:opacity-60"
            >
              {Icon && <Icon />}
              <span className="flex-1 text-[15px]">
                {label}
                {planned && (
                  <span className="ml-1.5 align-middle text-[10px] font-medium">規劃中</span>
                )}
              </span>
              {value && <span className="text-[13px] text-subtle">{value}</span>}
              {to && (
                <span className="rotate-180">
                  <ChevronLeftIcon />
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-6 px-5 text-center text-[11px] text-subtle">
        此頁為提案版，尚未取得設計稿
      </p>
    </div>
  )
}
