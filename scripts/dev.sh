#!/usr/bin/env bash
#
# 本機開發環境，一次起完。
#
# 平常要開三個終端機（Postgres、後端、前端），而且順序有差 ——
# 後端比資料庫早起來的話，第一次查詢會失敗，然後你會以為是程式壞了。
# 這支腳本把順序、等待、以及「一起關掉」都處理好。
#
# 用法：
#   scripts/dev.sh              資料庫 + 後端 + 前端
#   scripts/dev.sh api          只起資料庫 + 後端
#   scripts/dev.sh web          只起前端（後端已經在跑時用）
#   scripts/dev.sh --no-migrate 不要自動跑 migration
#
# Ctrl+C 會把後端與前端一起收掉。資料庫是 docker，**刻意留著不關** ——
# 每次重開要等它初始化，而且沒有理由跟著編輯器的生命週期走。
# 要關的話：npm run db:down
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TARGET="all"
RUN_MIGRATE=1

# ── 輸出 ──────────────────────────────────────────────────────────
if [ -t 1 ]; then
  B=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GRN=$'\033[32m'; YEL=$'\033[33m'; NC=$'\033[0m'
else
  B=""; DIM=""; RED=""; GRN=""; YEL=""; NC=""
fi
step() { printf '\n%s▸ %s%s\n' "$B" "$*" "$NC"; }
info() { printf '  %s\n' "$*"; }
ok()   { printf '  %s✓%s %s\n' "$GRN" "$NC" "$*"; }
warn() { printf '  %s!%s %s\n' "$YEL" "$NC" "$*"; }
die()  { printf '\n%s✗ %s%s\n' "$RED" "$*" "$NC" >&2; exit 1; }

usage() {
  awk 'NR > 1 { if ($0 !~ /^#/) exit; sub(/^# ?/, ""); print }' "${BASH_SOURCE[0]}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    all|api|web)  TARGET="$1" ;;
    --no-migrate) RUN_MIGRATE=0 ;;
    -h|--help)    usage; exit 0 ;;
    *)            die "不認得的參數：$1（-h 看用法）" ;;
  esac
  shift
done

command -v npm >/dev/null || die "找不到 npm"

# ── 收尾 ──────────────────────────────────────────────────────────
# 背景起來的 npm 會再 fork 出 node／vite，直接 kill $pid 只會殺到 npm，
# 真正在聽 port 的那個會活下來，下次啟動就會撞 port。所以殺整個 process group。
PIDS=()
cleanup() {
  trap - INT TERM EXIT
  [ ${#PIDS[@]} -eq 0 ] && exit 0
  printf '\n%s▸ 收工，關閉後端與前端…%s\n' "$B" "$NC"
  for pid in "${PIDS[@]}"; do
    kill -- "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  info "資料庫仍在背景執行（要關：npm run db:down）"
  exit 0
}
trap cleanup INT TERM EXIT

# 背景啟動一個 npm script，並記住它的 process group
spawn() {
  set -m
  "$@" &
  PIDS+=("$!")
  set +m
}

# ── 資料庫 ────────────────────────────────────────────────────────
if [ "$TARGET" != "web" ]; then
  step "資料庫"

  command -v docker >/dev/null || die "找不到 docker（資料庫跑在 docker 上）"
  docker info >/dev/null 2>&1 || die "docker daemon 沒有在跑，先打開 Docker Desktop"

  scripts/compose.sh up -d >/dev/null
  ok "容器已啟動"

  # 容器「跑起來」不等於 Postgres「接得上」——初始化要幾秒，
  # 這中間連進去會被拒絕。等它真的能接，不要用固定秒數猜。
  info "等待 Postgres 接受連線…"
  for i in $(seq 1 30); do
    if scripts/compose.sh exec -T postgres pg_isready -U movequest -d movequest >/dev/null 2>&1; then
      ok "Postgres 就緒"
      break
    fi
    [ "$i" -eq 30 ] && die "Postgres 等了 30 秒還是接不上，看 npm run db:logs"
    sleep 1
  done

  if [ "$RUN_MIGRATE" -eq 1 ]; then
    # 已套用過的會被跳過，所以每次都跑是安全的 —— 而且這樣才不會
    # 在別人加了 migration 之後，你拿舊 schema 跑出一堆看不懂的錯。
    step "Migration"
    npm --prefix apps/api run migrate --silent || die "migration 失敗"
  fi
fi

# ── 後端與前端 ────────────────────────────────────────────────────
if [ "$TARGET" != "web" ]; then
  step "後端"
  [ -f apps/api/.env ] || warn "apps/api/.env 不存在 —— 沒有 TDX 金鑰與 DATABASE_URL，大部分功能會是空的"
  spawn npm --prefix apps/api run dev
  ok "http://localhost:3000"
fi

if [ "$TARGET" != "api" ]; then
  step "前端"
  spawn npm --prefix apps/mobile run dev
fi

printf '\n%s全部啟動。Ctrl+C 一起關掉。%s\n' "$B" "$NC"
printf '%s（資料庫是 docker，不會跟著關）%s\n' "$DIM" "$NC"

wait
