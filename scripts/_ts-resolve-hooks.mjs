import fs from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) {
      for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
        try {
          const candidate = await next(specifier + ext, context);
          if (candidate) return candidate;
        } catch { /* 다음 확장자 시도 */ }
      }
    }
    throw error;
  }
}
void fs; void fileURLToPath;
