import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/*
 * 彈出式對話框（畫面中央的卡片）。
 *
 * 樣子照設計稿 delay-rescue-modal：置中的大圓角白卡，背景變暗並模糊，
 * 標題上方可以放一個圖示（icon）。
 * 這是「真的 modal」—— 打開時背景不能操作，所以無障礙的部分要做齊：
 *
 *   role="dialog" + aria-modal + aria-labelledby   螢幕閱讀器知道這是一個對話框、叫什麼
 *   打開時焦點移進來、關掉時還給原本的元素          鍵盤使用者不會被丟回頁首
 *   Tab 在面板裡循環、背景設 inert                 焦點不會跑到被遮住的按鈕上
 *   Esc 關閉、點遮罩關閉                            跟系統的對話框行為一致
 *
 * 用 portal 掛到 body 底下：這樣才能把整個 #root 設成 inert，
 * 面板自己又不在 #root 裡面，不會連自己一起鎖掉。
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** 對話框的標題。會當成 aria-labelledby 的對象，所以一定要有 */
  title: ReactNode;
  /** 標題上方的圖示（裝飾用，不進無障礙樹） */
  icon?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  /*
   * onClose 放 ref：呼叫端常常傳 inline 函式，每次 render 都是新的。
   * 放進 effect 的依賴裡的話，每次 render 都會重跑「焦點移入」，
   * 使用者正在按的按鈕會被搶走焦點。
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");

    /* 焦點給第一個可操作的元素（通常是主按鈕），沒有就給面板本身 */
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel) return;

      /* 焦點陷阱：在最後一個按 Tab 回到第一個，反之亦然 */
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const head = items[0];
      const tail = items[items.length - 1];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      root?.removeAttribute("inert");
      /* 還焦點要等 inert 拿掉之後，否則 focus() 在 inert 的子樹裡會失敗 */
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <>
      {/*
       * 遮罩只負責「點旁邊關閉」這個滑鼠／觸控的捷徑。
       * 不做成按鈕：鍵盤與螢幕閱讀器已經有 Esc 和面板裡的關閉按鈕，
       * 多一顆看不見的按鈕只會在 Tab 順序裡多一站。
       */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-ink/45 backdrop-blur-[3px] motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0"
      />

      {/*
       * 置中用一層不吃點擊的 flex 容器（pointer-events-none），點卡片以外的地方
       * 才會落到底下的遮罩、觸發關閉。
       * fixed 是對整個視窗定位，要用 max-w-shell 夾回手機殼的寬度（同 MissionSheet）；
       * 內容比畫面高時（矮螢幕、橫向）卡片自己捲動，不會被切掉。
       */}
      <div className="pointer-events-none fixed inset-0 z-50 mx-auto flex max-w-shell items-center justify-center px-6 py-[calc(1rem+env(safe-area-inset-top,0px))] max-[359px]:px-4">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="pointer-events-auto max-h-full w-full overflow-y-auto rounded-[28px] bg-surface px-5 pb-4 pt-6 shadow-[0_12px_40px_rgba(22,32,55,.22)] outline-none motion-safe:transition-[opacity,transform] motion-safe:duration-200 starting:scale-95 starting:opacity-0 max-[359px]:px-4"
        >
          {icon && (
            <div aria-hidden="true" className="mb-3 flex justify-center">
              {icon}
            </div>
          )}
          <h2
            id={titleId}
            className="text-center text-[21px] font-bold leading-snug"
          >
            {title}
          </h2>
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
