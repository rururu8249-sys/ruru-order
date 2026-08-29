// [2026-08-29] 테스트 전용 모듈 해석기.
//   lib/*.ts 안에서 확장자 없이 서로를 import 하는데(Next 빌드에선 정상),
//   node 로 테스트를 돌릴 때는 .ts 를 못 찾는다. 그래서 테스트에서만 .ts 를 붙여준다.
//   ⚠️ 앱 코드는 건드리지 않는다. 실행 방식만 바꾼다.
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import fs from "node:fs";

register(new URL("./_ts-resolve-hooks.mjs", import.meta.url), pathToFileURL("./"));
void fs;
