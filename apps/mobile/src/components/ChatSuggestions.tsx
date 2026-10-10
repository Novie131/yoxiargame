import { useCommuteRoute } from '@/lib/commute'
import { INTERESTS, useInterests } from '@/lib/interests'

/*
 * 對話的開場建議。
 *
 * 在這之前首頁是一片空白 —— 只有問候語跟一個輸入框。
 * 這個助理背後有一整組工具（天氣、路線規劃、交通比較、找店家與活動、存通勤路線…），
 * 但使用者沒有任何線索知道它們存在，只能猜著問。
 *
 * 這不只是 demo 的開場問題。空白輸入框是對話式介面最常見的失敗：
 * 使用者問了一句它做不到的事，得到一個模糊的回答，然後就不再用了。
 *
 * 建議句會依使用者已有的東西變動：
 *   設定過通勤路線 → 問那條線現在的狀況（他每天早上真正關心的事）
 *   還沒設定       → 示範怎麼用一句話設定（那是整個通知功能的前提）
 *   選過興趣       → 用他的興趣去找附近的活動
 *
 * 只在對話還是空的時候顯示。聊起來之後它就沒有用了，繼續佔著位置只會礙事。
 */

type Suggestion = { label: string; text: string }

/* 每一句都對應一個真的工具，不要放做不到的事 —— 那比沒有建議更傷 */
function suggestionsFor(
  commuteLine: string | null,
  commuteOrigin: string | null,
  interestLabel: string | null,
): Suggestion[] {
  const list: Suggestion[] = []

  if (commuteLine) {
    list.push({ label: `${commuteLine}現在正常嗎？`, text: `${commuteLine}現在正常嗎？` })
  } else {
    /* 這句是示範「用講的就能設定」，而通勤路線是異常通知的前提 */
    list.push({
      label: '我每天從板橋搭捷運到市政府',
      text: '我每天從板橋搭捷運到市政府',
    })
  }

  list.push({ label: '等一下會下雨嗎？', text: '等一下會下雨嗎？' })

  if (commuteOrigin) {
    list.push({
      label: `從${commuteOrigin}叫車到公司多少錢？`,
      text: `從${commuteOrigin}叫車到公司大概多少錢？`,
    })
  } else {
    list.push({ label: '去臺北101搭捷運還是叫車好？', text: '去臺北101搭捷運還是叫車比較好？' })
  }

  list.push({
    label: interestLabel ? `附近有什麼${interestLabel}的地方？` : '附近有什麼好玩的？',
    text: interestLabel ? `附近有什麼跟${interestLabel}有關的地方？` : '我附近有什麼好玩的？',
  })

  return list
}

export function ChatSuggestions({ onPick }: { onPick: (text: string) => void }) {
  const { route } = useCommuteRoute()
  const { selected } = useInterests()

  /*
   * 只拿第一個有資料的興趣。Pokémon GO 與 Pikmin 的 hasData 是 false ——
   * 拿它去問「附近有什麼」會查不到東西，那是最糟的第一印象。
   */
  const interest = INTERESTS.find((i) => i.hasData && selected.includes(i.id))

  const suggestions = suggestionsFor(
    route?.line ?? null,
    route?.origin ?? null,
    interest?.label ?? null,
  )

  return (
    <div className="pt-2">
      <p className="text-[13px] text-subtle">試試這樣問我：</p>

      <ul className="mt-2.5 space-y-2">
        {suggestions.map((s) => (
          <li key={s.label}>
            <button
              type="button"
              onClick={() => onPick(s.text)}
              className="w-full rounded-xl border border-primary/30 bg-primary-tint px-3.5 py-2.5 text-left text-[14px] text-primary transition-transform active:scale-[.99]"
            >
              {s.label}
            </button>
          </li>
        ))}
      </ul>

      {/*
        * 講清楚它知道什麼。使用者不知道 App 拿得到定位與即時路況時，
        * 就不會問「從我這裡怎麼去」那種真正省事的問題。
        */}
      <p className="mt-3 text-[12px] leading-[1.7] text-subtle">
        我知道你在哪、天氣如何、捷運與公車此刻的狀況，
        也可以幫你比較怎麼去最划算、找附近的店和活動。
      </p>
    </div>
  )
}
