import { useNavigate } from 'react-router'

import { CarIcon, MapPinIcon } from './icons'
import { missionRelativeTo, type Mission } from '@/lib/missions'
import { useTripOptions, type TripOption } from '@/lib/tripOptions'

/*
 * 探索任務的詳情面板。
 *
 * 設計上的重點是**不預設推叫車**。三百公尺的任務跳出「叫車前往」，
 * 使用者只會學到這個 App 在推銷，然後不再相信它給的任何建議。
 * 所以選項一律照後端算出來的實際時間排序，畫面不重排 ——
 * 走路比較快就走路排前面，叫車因為沒有時間依據固定在最後。
 *
 * 沿用叫車流程那套底部面板的視覺（圓角、把手、陰影），只是這裡是彈出式的。
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
    return {
      title: `搭捷運 約 ${o.totalMinutes} 分鐘`,
      detail:
        `走 ${o.fromStation.walkMinutes} 分到${o.fromStation.name}・${legs}` +
        `${o.plan.transfers > 0 ? `・轉乘 ${o.plan.transfers} 次` : ''}` +
        `・出站走 ${o.toStation.walkMinutes} 分`,
    }
  }
  /* 叫車沒有時間也沒有車資 —— 沒有資料來源就不要編一個 */
  return { title: '叫車前往', detail: '車程與車資待接上叫車服務後顯示' }
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

      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-surface px-4 pb-6 pt-2.5 shadow-[0_-4px_20px_rgba(22,32,55,.18)]">
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
          <p className="mt-4 rounded-2xl bg-success-tint px-4 py-3.5 text-[14px] text-success">
            你已經在這個任務的範圍內，可以直接開始。
          </p>
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
