#!/usr/bin/env bash
# Review-branch verification only. No package installation, SQL, merge, push,
# deployment, production order, or live notification command is run here.
set -euo pipefail

TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$TASK_ROOT"

if [ "$(git branch --show-current)" != "fix/subscribe-once-point-20261122" ]; then
  echo "검토 브랜치가 아닙니다. 현재 작업을 보존하고 검사를 중단합니다." >&2
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "커밋되지 않은 변경이 있습니다. 파일을 보존하고 검사를 중단합니다." >&2
  exit 1
fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("Node.js 24 이상이 필요합니다."); process.exit(1); }'
if [ ! -x node_modules/.bin/tsc ]; then
  echo "이 작업 폴더의 TypeScript 설치를 찾을 수 없습니다. 자동 설치하지 않고 중단합니다." >&2
  exit 1
fi

echo "[1/4] 구독·합배송 정책 및 실제 주문 API 재전송 검사"
node --import ./scripts/_ts-resolve.mjs scripts/test-subscribe-1time-20261122.mjs
node --import ./scripts/_ts-resolve.mjs scripts/test-subscribe-combine-20261122.mjs
node --import ./scripts/_ts-resolve.mjs scripts/test-subscribe-source-filters-20261122.mjs
node scripts/test-subscribe-last-safety-20261122.mjs

echo "[2/4] 기존 주문 계좌·상품·선점·주소 회귀검사"
node --import ./scripts/_ts-resolve.mjs scripts/test-customer-order-bank-submit.mjs
node --import ./scripts/_ts-resolve.mjs scripts/test-cart-hold-gate.mjs
node scripts/test-cart-clear-marks.mjs
node --import ./scripts/_ts-resolve.mjs scripts/test-brand-linked-submit.mjs
node scripts/test-order-postcode-flow.mjs
node scripts/test-order-postcode-persistence-runtime.mjs
node scripts/test-first-order-info.mjs

echo "[3/4] TypeScript 전체 검사"
./node_modules/.bin/tsc --noEmit

echo "[4/4] 기존 prebuild 검사 및 Next.js 빌드"
npm run build
git diff --check

echo "RURU_REPLAY_VERIFICATION=SUCCESS"
echo "RURU_COMMIT=$(git rev-parse HEAD)"
echo "RURU_PRODUCTION_DB_CHANGED=NO"
echo "RURU_PRODUCTION_DEPLOYED=NO"
echo "LIMIT=실제 DB 주문·동시 트랜잭션·실기기 결제 E2E는 별도 검증 대상입니다."
