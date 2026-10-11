/*
 * 精選散步路線（Figma 05C route-detail-ig-style 的溫州街）。
 *
 * 三個地方會用到同一條路線：探索頁的「今日旅行推薦」、Agent 的散步路線卡、
 * 路線詳情頁（/explore/ig-route）。放在一起，三處的公里數、分鐘數才不會各寫各的。
 *
 * 內容是**示範貼文**，照設計稿寫死；目前只有這一條。後端 suggest_walk_route
 * 只回 id，卡片從這裡查內容。
 */

export const WALK_ROUTE = {
  id: 'wenzhou',
  path: '/explore/ig-route',
  image: '/images/ig-wenzhou-street.jpg',
  badge: '老屋散策・熱門路線',
  title: '溫州街日式老屋與獨立書香漫步',
  tags: ['老屋散策', '獨立書店', '日式建築', '台大周邊'],
  body:
    '漫步溫州街巷弄，探索日治時期留下的老屋群落。從台大校門出發，沿途經過獨立書店、老樹咖啡館，' +
    '感受台北最有文青氣息的街區。每一棟老屋都有自己的故事，每一間書店都是一個小宇宙。' +
    '巷弄狹窄、住戶多，散步時請放輕音量並留意來車。',
  likes: 1284,
  distanceKm: 1.8,
  minutes: 45,
  spots: 5,
  /* 路線起點。座標取台大正門（羅斯福路與新生南路口） */
  start: {
    label: '台灣大學校門口',
    note: '捷運公館站 3 號出口',
    lat: 25.0172,
    lon: 121.5399,
  },
} as const
