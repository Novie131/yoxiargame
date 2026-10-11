import type { DrivingRoute } from '@/lib/drivingRoute'

/*
 * 地圖上那條紅線的圖例：告訴使用者這是什麼路線、從哪裡來。
 *
 * 公里數只在「估價也是用道路距離算的」時才標（estimate.distanceSource === 'road'）：
 * 那時後端跟這條線問的是同一個 OSRM、同一組座標，數字就是這條線的長度。
 * 估價退回直線 × 係數時不標 —— 線旁邊放一個不是這條線的數字，只會互相打架。
 *
 * OSRM 拿不到時地圖畫的是虛線直線，這裡要照實講，不能還叫它「最佳路線」。
 */
export function RouteLegend({
  driving,
  label = '最佳行車路線',
  distanceKm = null,
  className = 'bottom-5',
}: {
  driving: DrivingRoute | null
  label?: string
  /** 這條線的道路距離。只在估價的距離來源是 road 時傳 */
  distanceKm?: number | null
  /** 垂直位置。地圖底部已經有別的膠囊時往上疊 */
  className?: string
}) {
  if (!driving) return null
  const road = driving.source === 'road'

  return (
    <p
      className={[
        'pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface/90 px-2.5 py-1 text-[11px] font-medium shadow-[0_1px_6px_rgba(22,32,55,.12)]',
        className,
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={['inline-block w-4 border-t-[3px] border-primary', road ? '' : 'border-dashed'].join(' ')}
      />
      {/* 文字包在同一個 span：直接放進 flex 會被 gap 從句子中間拆開 */}
      {road ? (
        <span>
          {label}
          {distanceKm != null ? (
            `・約 ${distanceKm} 公里`
          ) : (
            /* 320 寬時右下角的定位鈕會貼上來，後半句先收掉 */
            <span className="max-[359px]:hidden">・依道路規劃</span>
          )}
        </span>
      ) : (
        <span>
          <span className="max-[359px]:hidden">路線規劃暫時無法取得，先</span>以直線示意
        </span>
      )}
    </p>
  )
}
