import assert from 'node:assert/strict';
import { createUiLoader } from './admin-ui-test-loader.mjs';
const { fetchBankdaTransactions } = createUiLoader()('lib/bankda/fetchBankdaTransactions.ts');
const originalFetch = globalThis.fetch;
const originalToken = process.env.BANKDA_ACCESS_TOKEN;
process.env.BANKDA_ACCESS_TOKEN = 'test-only';
try {
  for (const [row, expected] of [
    [{ bkdate: '20261005', bktime: '231628' }, '2026-10-05T14:16:28.000Z'],
    [{ bkdate: '20260230', bktime: '231628' }, ''],
    [{ bktime: '231628' }, ''],
    [{ datetime: '2026-10-05 23:16:28' }, '2026-10-05T14:16:28.000Z'],
    [{ bkdate: '20261005', bktime: '250000' }, ''],
  ]) {
    globalThis.fetch = async () => ({ ok: true, text: async () => JSON.stringify([{ bkjukyo: 'guest', bkinput: 119000, ...row }]) });
    const result = await fetchBankdaTransactions();
    assert.equal(result.deposits[0].deposited_time, expected, 'Bank date must be real, validated, and interpreted in KST');
  }
} finally {
  globalThis.fetch = originalFetch;
  if (originalToken === undefined) delete process.env.BANKDA_ACCESS_TOKEN; else process.env.BANKDA_ACCESS_TOKEN = originalToken;
}
console.log('PASS: bank transaction date validation, missing date fail closed, KST conversion');
