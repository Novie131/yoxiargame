#!/usr/bin/env bash
# Postgres 定義在架構專屬的 compose 檔裡，base 只有 Redis，兩者要疊加。
set -euo pipefail

case "$(uname -m)" in
  arm64|aarch64) ARCH=arm64 ;;
  x86_64|amd64)  ARCH=amd64 ;;
  *) echo "不支援的架構：$(uname -m)" >&2; exit 1 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

exec docker compose \
  -f "$ROOT/infra/compose/compose.base.yml" \
  -f "$ROOT/infra/compose/compose.$ARCH.yml" \
  "$@"
