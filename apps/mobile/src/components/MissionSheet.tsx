import { useState } from 'react'
import { useNavigate } from 'react-router'

import { CarIcon, MapPinIcon } from './icons'
import { checkInMission, missionRelativeTo, type Mission } from '@/lib/missions'
import { formatFare } from '@/lib/ride'
import { useTripOptions, type TripAdvice, type TripOption } from '@/lib/tripOptions'

/*
 * 探索任務的詳情面板。
 *
 * 設計上的重點是**不預設推叫車**。三百公尺的任務跳出「叫車前往」，
 * 使用者只會學到這個 App 在推銷，然後不再相信它給的任何建議。
 * 所以選項一律照後端算出來的實際時間排序，畫面不重排 ——
 * 走路比較快就走路排前面。叫車現在有估計時間了，短程時它可能排第一，
 * 那是排序的結果不是推銷。
 *
 * 沿用叫車流程那套底部面板的視覺（圓角、把手、陰影），只是這裡是彈出式的。
 *
 * 面板上方那句「建議」也遵守同一條規則：它**不會**改變清單順序，
 * 而且它說得出「別叫車」。只會說「叫車吧」的建議就只是包裝過的推銷。
 */

function optionLabel(o: TripOption): { title: string; detail: string } {
  if (o.mode === 'walk') {
    return {
      title: `步行 ${o.minutes} 分鐘`,
      detail: `約 ${o.distanceMeters >= 1000 ? `${(o.distanceMeters / 1000).toFixed(1)} 公里` : `${o.distanceMeters} 公尺`}`,
    }
  }
  if (o.mode === 'metro') {
    const legs = o.plan.legs.map((l) => l.line).join(' → ')
    /*
     * 票價放進標題而不是細節：時間與錢是同一個決定的兩半，
     * 把錢藏在第二行等於還是只給了半句話。查不到就整段不顯示。
     */
    return {
      title: `搭捷運 約 ${o.totalMinutes} 分鐘${o.fare ? `・NT$${o.fare.singleJourney}` : ''}`,
      detail:
        `走 ${o.fromStation.walkMinutes} 分到${o.fromStation.name}・${legs}` +
        `${o.plan.transfers > 0 ? `・轉乘 ${o.plan.transfers} 次` : ''}` +
        `・出站走 ${o.toStation.walkMinutes} 分` +
        /* basis 要跟數字一起出現，不然使用者會以為這就是他會付的錢 */
        (o.fare ? `・${o.fare.basis}` : ''),
    }
  }
  /*
   * 車資是依公告費率估算的，不是 yoxi 報價 —— detail 要把這件事講出來，
   * 不然使用者會以為這是已經談好的價錢。
   */
  return {
    title: `叫車 約 ${o.estimate.durationMinutes} 分鐘`,
    detail: `${formatFare(o.estimate.fare)}・${o.estimate.distanceKm} 公里・依公告費率估算`,
  }
}

/*
 * 「值不值得」的一句話。
 *
 * 兩種 verdict 用不同的配色，而且**勸退那一種不能比較不顯眼** ——
 * 把「別叫車」畫得比「叫車吧」淡，就是用視覺把立場偷渡回去。
 */
function AdviceLine({ advice }: { advice: TripAdvice }) {
  const suggestsRide = advice.verdict === 'ride'
  return (
    <div
      className="mt-2 rounded-2xl px-4 py-3"
      style={{
        background: suggestsRide ? 'var(--color-primary-tint)' : 'var(--color-success-tint)',
      }}
    >
      <p
        className="text-[14px] font-semibold"
        style={{ color: suggestsRide ? 'var(--color-primary)' : 'var(--color-success)' }}
      >
        {suggestsRide ? '☔️ ' : '🚇 '}
        {advice.headline}
      </p>
      {/* 理由一定要顯示 —— 使用者得能自己判斷我們的推論成不成立 */}
      <p className="mt-1 text-[12px] text-muted">{advice.reason}</p>
    </div>
  )
}

export function MissionSheet({
  mission,
  origin,
  onClose,
}: {
  mission: Mission
  /** 使用者目前位置。沒有定位就沒辦法比較怎麼去。 */
  origin: { lat: number; lon: number } | null
  onClose: () => void
}) {
  const navigate = useNavigate()
  const trip = useTripOptions(origin, { lat: mission.lat, lon: mission.lon })

  /*
   * 打卡狀態。
   *
   * 初值取自任務本身（後端在 /missions/nearby 一起回的 status），
   * 所以重新打開面板不會把已經完成的任務又顯示成未完成。
   */
  const [done, setDone] = useState(mission.status === 'completed')
  const [checking, setChecking] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const checkIn = async () => {
    if (!origin || checking || done) return

    setChecking(true)
    setProblem(null)
    try {
      const result = await checkInMission(mission.id, origin)
      if (result.ok) {
        setDone(true)
        return
      }
      /*
       * 伺服器說不行時，照它的理由講 —— 不要一律回「打卡失敗」。
       * 前端的 inside 與伺服器可能不一致（站在邊界、定位飄了幾公尺），
       * 那時候使用者需要知道的是還差幾公尺，不是一句籠統的失敗。
       */
      setProblem(
        result.reason === 'outside'
          ? `還差 ${result.distanceMeters ?? '?'} 公尺才進得了範圍`
          : result.reason === 'closed'
            ? '這個活動已經結束了'
            : '找不到這個任務，它可能剛下架',
      )
    } catch {
      setProblem('打卡暫時無法完成，請稍後再試')
    } finally {
      setChecking(false)
    }
  }

  /*
   * 距離與「在不在範圍內」一律以使用者的真實位置為準，不能用 API 回的值 ——
   * 那是相對於地圖中心算的，從通知點進來時地圖就在任務上，會誤判成已抵達。
   */
  const relative = missionRelativeTo(mission, origin)

  const goRide = () => {
    /* 帶著任務名稱與座標進叫車流程，這就是「精準導流」實際的樣子 */
    const params = new URLSearchParams({
      to: mission.name,
      toLat: String(mission.lat),
      toLon: String(mission.lon),
    })
    navigate(`/ride/estimate?${params}`)
  }

  return (
    <>
      {/* 點背景關閉。用按鈕而不是 div，鍵盤與螢幕閱讀器才操作得到。 */}
      <button
        type="button"
        aria-label="關閉任務詳情"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-ink/30"
      />

      {/*
        * fixed 是對整個視窗定位，不加 max-w-shell 的話，
        * 在平板或桌機上面板會橫跨整個螢幕、跑出手機殼。
        * inset-x-0 加 mx-auto 讓它在限寬之後仍然置中。
        * 下緣貼著畫面底，所以底部留白要再加上 home indicator 的高度，
        * 不然「叫車前往」「關閉」會壓在那條橫線底下。
        */}
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-shell rounded-t-3xl bg-surface px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-2.5 shadow-[0_-4px_20px_rgba(22,32,55,.18)]">
        <span className="mx-auto mb-3 block h-1 w-9 rounded-full bg-line/70" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[20px] font-bold">{mission.name}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
              <MapPinIcon />
              {mission.campaign}
            </p>
          </div>
          {relative?.inside && (
            <span className="shrink-0 rounded-full bg-success-tint px-3 py-1.5 text-[12px] font-semibold text-success">
              已在範圍內
            </span>
          )}
        </div>

        {relative?.inside ? (
          <div className="mt-4">
            {/*
              * 進到範圍內才給打卡 —— 這是整條價值鏈的最後一步：
              * 發現任務 → 誠實比較怎麼去 → 到了 → 完成。
              * 在範圍外就給按鈕的話，那顆按鈕唯一的功能是讓人按了失敗。
              */}
            {done ? (
              <p className="rounded-2xl bg-success-tint px-4 py-3.5 text-[14px] font-semibold text-success">
                ✓ 已完成這個任務
              </p>
            ) : (
              <>
                <p className="rounded-2xl bg-success-tint px-4 py-3.5 text-[14px] text-success">
                  你已經在這個任務的範圍內，可以直接完成。
                </p>
                <button
                  type="button"
                  onClick={checkIn}
                  disabled={checking}
                  className="mt-2 w-full rounded-2xl bg-primary py-3.5 text-[16px] font-semibold text-white transition-transform active:scale-[.98] disabled:opacity-60"
                >
                  {checking ? '打卡中…' : '完成打卡'}
                </button>
              </>
            )}

            {/* 失敗的理由要照實講，使用者才知道下一步能做什麼 */}
            {problem && (
              <p className="mt-2 text-[13px] text-primary" role="alert">
                {problem}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-[12px] text-subtle">怎麼去</p>

            {/*
              * 沒有定位就比較不了「從你這裡過去要多久」。要照實說並給出路，
              * 不能停在「計算中…」轉圈 —— 那是永遠不會結束的（踩過）。
              */}
            {!origin && (
              <div className="mt-2">
                <p className="text-[13px] text-muted">
                  開啟定位權限後，這裡會比較走路、捷運與叫車各要多久。
                </p>
                <button
                  type="button"
                  onClick={goRide}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-primary py-3 text-[15px] font-semibold text-white transition-transform active:scale-[.98]"
                >
                  <CarIcon />
                  叫車前往
                </button>
              </div>
            )}

            {origin && trip.status === 'loading' && (
              <p className="mt-2 text-[13px] text-muted">計算中…</p>
            )}
            {origin && trip.status === 'error' && (
              <p className="mt-2 text-[13px] text-muted">
                交通選項暫時取不到，你仍然可以直接叫車。
              </p>
            )}

            {/*
              * 建議在清單上方，但清單順序不受它影響 —— 那個分離是這個功能的重點。
              */}
            {origin && trip.status === 'ready' && trip.data.advice && (
              <AdviceLine advice={trip.data.advice} />
            )}

            {origin && trip.status === 'ready' && (
              <ul className="mt-2 space-y-2">
                {trip.data.options.map((o, i) => {
                  const { title, detail } = optionLabel(o)
                  const isRide = o.mode === 'ride'
                  return (
                    <li key={o.mode}>
                      <button
                        type="button"
                        onClick={isRide ? goRide : undefined}
                        disabled={!isRide}
                        className={[
                          'w-full rounded-2xl px-4 py-3 text-left transition-colors',
                          /* 第一個是實際最快的，給它視覺重量 —— 但那不一定是叫車 */
                          i === 0 ? 'bg-primary-tint' : 'bg-surface-2',
                          isRide ? 'active:scale-[.99]' : 'disabled:opacity-100',
                        ].join(' ')}
                      >
                        <span className="flex items-center gap-2 text-[15px] font-semibold">
                          {isRide && <CarIcon />}
                          {title}
                          {i === 0 && (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                              最快
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-muted">{detail}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-surface-3 py-3 text-[15px] font-semibold text-muted"
        >
          關閉
        </button>
      </div>
    </>
  )
}
