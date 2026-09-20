import { useNavigate } from 'react-router'

import { ChatComposer } from '@/components/ChatComposer'
import { HomeHeader } from '@/components/HomeHeader'
import { INTERESTS, toggleInterest, useInterests } from '@/lib/interests'

/*
 * 對應設計稿 frame：首頁 Agent_興趣調查
 *
 * 這頁原本是**裝飾用的**：自己寫死一份標籤清單、選取狀態存在本地 useState，
 * 離開畫面就沒了。使用者在這裡選的興趣不會影響探索頁的篩選，也不會同步到後端 ——
 * 那個「為您量身打造專屬推薦」的承諾完全沒有兌現。
 *
 * 現在接的是 lib/interests 的共用 store，跟探索頁的篩選 chip 是同一份資料：
 *   - 值對得上 missions.tags（後端 seed-missions.ts 用的就是這組 id）
 *   - 會同步到後端，反向導流的輪詢才看得到
 *   - 在探索頁改了，回到這裡也是對的
 *
 * 設計稿原本的「潮流／藝術／手作」換成了 lib 那份清單。理由是那份對得上
 * 實際的任務標籤；設計稿那三個沒有任何任務掛著，選了只會是空的。
 */

export function AgentInterestsScreen() {
  const navigate = useNavigate()
  const { selected } = useInterests()

  /* Pokémon GO 與 Pikmin 在設計稿上是放大的主打項 */
  const featured = new Set(['pokemon-go', 'pikmin'])

  /* 有選到至少一個「真的查得到東西」的標籤時，推薦才有意義 */
  const usable = INTERESTS.some((i) => i.hasData && selected.includes(i.id))

  return (
    <div className="flex h-full flex-col">
      <HomeHeader />

      <section className="flex-1 overflow-y-auto px-5 pb-4">
        <h2 className="text-[17px] font-bold">選擇你想探索的興趣</h2>
        <p className="mt-1 text-[13px] text-subtle">
          選取感興趣的標籤，探索頁與主動推薦都會依此篩選
        </p>

        <div className="mt-4 flex flex-wrap gap-2.5">
          {INTERESTS.map(({ id, label, hasData }) => {
            const on = selected.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleInterest(id)}
                aria-pressed={on}
                className={[
                  'rounded-full border text-[14px] transition-colors',
                  featured.has(id) ? 'px-4 py-2.5' : 'px-4 py-2',
                  on ? 'border-primary bg-primary-tint text-primary' : 'border-line/70 text-ink',
                ].join(' ')}
              >
                {label}
                {/*
                  * 沒有資料的標籤照實說。Pokémon GO 與 Pikmin 是產品方向的一部分，
                  * 但我們跟那兩款遊戲沒有實際整合 —— 選了會是空的，
                  * 與其讓使用者以為壞了，不如先講。
                  */}
                {!hasData && (
                  <span className={`ml-1.5 text-[10px] ${on ? '' : 'text-subtle'}`}>尚無資料</span>
                )}
              </button>
            )
          })}
        </div>

        {/*
          * 選完要有出口。原本選一選就停在這裡，看不到任何結果 ——
          * 而興趣真正發生作用的地方是探索頁的地圖篩選，直接帶過去。
          */}
        <button
          type="button"
          onClick={() => navigate('/explore')}
          className="mt-5 w-full rounded-xl bg-primary py-3.5 text-[16px] font-semibold text-white transition-transform active:scale-[.98]"
        >
          {selected.length === 0 || !usable
            ? '看看附近有什麼'
            : `依這 ${selected.length} 個興趣看附近`}
        </button>

        {selected.length > 0 && !usable && (
          <p className="mt-2 text-center text-[12px] text-subtle">
            目前選的標籤還沒有對應的任務資料，探索頁會顯示這一帶全部的任務
          </p>
        )}
      </section>

      <ChatComposer />
    </div>
  )
}
