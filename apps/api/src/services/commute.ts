import { hasDatabase } from '../db/client.ts'
import {
  deleteCommuteRoute,
  getCommuteRoute,
  saveCommuteRoute,
  type CommuteRoute,
  type TransportMode,
} from '../db/repositories/commute.ts'
import { USER_REF_PROVIDER } from '../identity.ts'
import { hasTdxCredentials, resolveCommuteLine } from './tdx.ts'

/*
 * 通勤路線的使用案例層。
 *
 * 有兩個入口會存路線 —— 設定畫面的表單（POST /commute/route）與
 * 對話裡的 save_commute_route 工具 —— 兩邊必須存出完全一樣的東西，
 * 否則使用者用講的設定完，再打開表單會看到不一致的資料。
 * 所以推路線、寫資料庫、無資料庫時的退路都收在這裡，兩個入口只負責轉接。
 */

export type SaveRouteInput = {
  userRef: string
  origin: string
  destination: string
  mode: TransportMode
  /** 使用者自己指定的路線名；沒給就從起訖站推 */
  line?: string | null
}

export type SaveRouteResult = {
  route: CommuteRoute
  /** 起訖站沒有共同路線，代表中途要轉乘 */
  transferRequired: boolean
  /** 沒設定 DATABASE_URL 時為 false —— 這次的結果只存在於回應裡 */
  persisted: boolean
}

/*
 * 路線名（例如「板南線」）的來源。
 *
 * 使用者只會說「板橋到市政府」，不會說路線名，但即時狀態徽章與之後的
 * 誤點通知都需要它。所以由起訖站去 TDX 反推，推不出來就是 null ——
 * 不要猜一條線，否則會拿錯的路線去查狀態，還顯示得煞有介事。
 */
type Resolved = {
  line: string | null
  transferRequired: boolean
  /** 對得上 TDX 站表時換成正式站名，對不上就維持原字串 */
  origin: string
  destination: string
}

async function resolve(
  origin: string,
  destination: string,
  mode: TransportMode,
  explicit?: string | null,
): Promise<Resolved> {
  const given = explicit?.trim()
  const base = { line: given || null, transferRequired: false, origin, destination }

  /* 公車的路線名就是使用者講的號碼，沒講就沒得推；也沒有站表可以對正式站名 */
  if (mode === 'bus' || !hasTdxCredentials()) return base

  try {
    const r = await resolveCommuteLine(origin, destination)
    return {
      /* 使用者自己指定的路線名優先，不要被推導結果蓋掉 */
      line: given || r.line,
      transferRequired: r.transferRequired,
      origin: r.originName,
      destination: r.destinationName,
    }
  } catch (error) {
    /* TDX 掛掉不該讓「存路線」這件事失敗，沒有 line 只是少了狀態徽章 */
    console.error('[commute] 推導路線名失敗：', error)
    return base
  }
}

export async function saveRoute(input: SaveRouteInput): Promise<SaveRouteResult> {
  const { origin, destination, line, transferRequired } = await resolve(
    input.origin.trim(),
    input.destination.trim(),
    input.mode,
    input.line,
  )

  /*
   * 沒有設定 DATABASE_URL 時（例如純 demo 部署）不寫資料庫，但仍回傳完整結果：
   * 流程照樣走得完、畫面照樣更新，只是重開 App 就沒了。
   */
  if (!hasDatabase()) {
    return {
      route: {
        origin,
        destination,
        mode: input.mode,
        line,
        delayThresholdMinutes: 5,
        notificationEnabled: true,
      },
      transferRequired,
      persisted: false,
    }
  }

  const route = await saveCommuteRoute({
    externalUserRef: input.userRef,
    provider: USER_REF_PROVIDER,
    origin,
    destination,
    mode: input.mode,
    line,
  })
  return { route, transferRequired, persisted: true }
}

export async function readRoute(userRef: string): Promise<CommuteRoute | null> {
  if (!hasDatabase()) return null
  return getCommuteRoute(userRef, USER_REF_PROVIDER)
}

export async function clearRoute(userRef: string): Promise<boolean> {
  if (!hasDatabase()) return false
  return deleteCommuteRoute(userRef, USER_REF_PROVIDER)
}
