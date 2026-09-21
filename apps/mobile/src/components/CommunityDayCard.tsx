import { formatFare } from '@/lib/ride'
import { minutesLeft, type Itinerary } from '@/lib/communityDay'

/*
 * 社群日的行程卡。
 *
 * Task.md 的「AR 遊戲行程設計」與「精準導流」：把一場活動的多個冷門地點
 * 排成一條跑得完的路線，並在每一段照實說用走的還是值得叫車。
 *
 * ── 三件事刻意不做 ──
 *
 * 1. **不寫「附近有 N 人可共乘」。** participantsToday 是「今天多少人完成過
 *    這場活動的任務」的聚合數字。真正的共乘媒合需要登入、即時位置與
 *    使用者密度，三個我們都沒有。把熱度講成可媒合的人數就是編造。
 *
 * 2. **不是每一段都給車資。** 只有系統真的判斷該叫車的段落才顯示價錢。
 *    每段都掛一個數字，這張卡就從行程規劃變成報價單。
 *
 * 3. **沒有活動時整張卡不出現。** 一年裡大部分日子都沒有社群日，
 *    放一張「目前沒有活動」佔著探索頁最顯眼的位置，只會讓人學會略過它。
 */
export function CommunityDayCard({
  day,
  onPick,
}: {
  day: Itinerary
  /** 點某一站 → 打開那個任務的詳情面板 */
  onPick: (missionId: string) => void
}) {
  const left = minutesLeft(day.endsAt)
  const allDone = day.legs.length === 0

  return (
    <div className="rounded-2xl bg-surface p-4 shadow-[0_2px_12px_rgba(22,32,55,.08)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-primary">社群日進行中</p>
          <h3 className="mt-0.5 truncate text-[17px] font-bold">{day.name}</h3>
        </div>
        {/* 剩餘時間是這張卡最有行動力的資訊，給它最大的視覺重量 */}
        {left !== null && (
          <span className="shrink-0 rounded-full bg-primary-tint px-3 py-1 text-[12px] font-semibold text-primary">
            剩 {left >= 60 ? `${Math.floor(left / 60)} 小時` : `${left} 分`}
          </span>
        )}
      </div>

      <p className="mt-1.5 text-[12px] text-muted">
        {day.completed > 0 && `已完成 ${day.completed} 個・`}
        還有 {day.remaining} 個點
        {day.totalWalkMinutes > 0 && `・步行約 ${day.totalWalkMinutes} 分`}
        {/*
          * 熱度。刻意寫「人跑過這場活動」而不是「人在附近」——
          * 後者我們不知道，而且會被讀成可以揪團。
          */}
        {day.participantsToday > 0 && `・今天 ${day.participantsToday} 人跑過這場`}
      </p>

      {allDone ? (
        <p className="mt-3 rounded-xl bg-success-tint px-4 py-3 text-[14px] font-semibold text-success">
          ✓ 這場活動你跑完了
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {day.legs.map((leg) => (
            <li key={leg.mission.id}>
              <button
                type="button"
                onClick={() => onPick(leg.mission.id)}
                className="flex w-full items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5 text-left transition-transform active:scale-[.99]"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-white">
                  {leg.order}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">
                    {leg.mission.name}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted">
                    {leg.mode === 'walk' ? (
                      <>走 {leg.walkMinutes} 分・{leg.distanceMeters} 公尺</>
                    ) : (
                      /*
                       * 建議叫車時，走路要幾分鐘也一起講 ——
                       * 只給車資會變成「你只能叫車」，那不是誠實比較。
                       */
                      <>
                        🚕 {leg.ride ? formatFare(leg.ride.fare) : '建議叫車'}・
                        {leg.ride ? `${leg.ride.durationMinutes} 分` : ''}
                        （走路要 {leg.walkMinutes} 分）
                      </>
                    )}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {/* 數字怎麼來的。跟 ride.ts 的 basis 同一個用意，不要拿掉。 */}
      <p className="mt-2.5 text-[11px] text-subtle">{day.basis}</p>
    </div>
  )
}
