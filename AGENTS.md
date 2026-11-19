<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## 사용자 확정 작업 원칙 (2026-11-20)

- 모든 작업은 기존 설계 의도와 사용자가 확정한 결정을 먼저 확인한 뒤 진행한다.
- `CLAUDE.md`, 관련 설계 문서, 실제 코드·테스트와 변경 이력을 대조한다. 추정을 사실처럼 취급하거나 추정만으로 기준을 바꾸지 않는다.
- 기존 동작에 이유가 있을 수 있다. 테스트가 실패한다고 기대값을 바꾸거나, 전화번호·계정이 겹친다는 사실만으로 회원·주문 연결을 재정의하지 않는다.
- 확인 → 문제 재현 → 필요한 수정 → 검증 순서로 작업한다. 기존 의도를 유지하는지와 다른 기능에 미치는 영향을 검증한다.
- 중간 질문에는 답한 뒤 진행 중인 원래 작업을 계속한다. 새 요청은 기존 목표와 순서에 반영하고 작업을 잊거나 임의로 교체하지 않는다.
- 확인한 사실, 아직 확인하지 못한 사항, 구현·배포·실화면 검증 상태를 구분해서 보고한다.
