/* 還沒實作的畫面 —— 依 Document/ 的設計稿逐頁補上 */
export function Placeholder({ title, figmaFrame }: { title: string; figmaFrame: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="text-[17px] font-bold">{title}</p>
      <p className="text-[13px] text-subtle">尚未實作</p>
      <p className="mt-2 rounded-lg bg-surface-3 px-3 py-1.5 text-[12px] text-muted">
        對應設計稿：{figmaFrame}
      </p>
    </div>
  )
}
