import { useState } from 'react'

import { ChatComposer } from '@/components/ChatComposer'
import { HomeHeader } from '@/components/HomeHeader'

/* 對應設計稿 frame：首頁 Agent_興趣調查 */

type Interest = { id: string; label: string; featured?: boolean }

const interests: Interest[] = [
  { id: 'pokemon-go', label: 'Pokémon GO 寶可夢 GO', featured: true },
  { id: 'pikmin', label: 'Pikmin 皮克敏', featured: true },
  { id: 'food', label: '美食' },
  { id: 'travel', label: '旅行' },
  { id: 'trend', label: '潮流' },
  { id: 'reading', label: '閱讀' },
  { id: 'music', label: '音樂' },
  { id: 'art', label: '藝術' },
  { id: 'sport', label: '運動' },
  { id: 'photo', label: '攝影' },
  { id: 'craft', label: '手作' },
]

const initiallySelected = ['pokemon-go', 'pikmin', 'travel', 'art']

export function AgentInterestsScreen() {
  const [selected, setSelected] = useState<string[]>(initiallySelected)

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )

  return (
    <div className="flex h-full flex-col">
      <HomeHeader />

      <section className="flex-1 overflow-y-auto px-5">
        <h2 className="text-[17px] font-bold">選擇你想探索的興趣</h2>
        <p className="mt-1 text-[13px] text-subtle">
          選取感興趣的標籤，為您量身打造專屬推薦
        </p>

        <div className="mt-4 flex flex-wrap gap-2.5">
          {interests.map(({ id, label, featured }) => {
            const on = selected.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={on}
                className={[
                  'rounded-full border text-[14px] transition-colors',
                  featured ? 'px-4 py-2.5' : 'px-4 py-2',
                  on
                    ? 'border-primary bg-primary-tint text-primary'
                    : 'border-line/70 text-ink',
                ].join(' ')}
              >
                {label}
              </button>
            )
          })}
        </div>
      </section>

      <ChatComposer />
    </div>
  )
}
