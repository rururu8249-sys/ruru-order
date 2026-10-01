export const FINAL_SUBMIT_CONFIRMATION_KEY = "final_submit_confirmation_enabled";

type SettingRow = { key?: unknown; value?: unknown };

export function parseFinalSubmitConfirmationEnabled(rows: readonly SettingRow[]): boolean {
  const value = String(
    rows.find((row) => String(row?.key ?? "").trim() === FINAL_SUBMIT_CONFIRMATION_KEY)?.value ?? "",
  ).trim().toLowerCase();

  return value !== "false";
}

export function toFinalSubmitConfirmationRow(enabled: boolean) {
  return {
    key: FINAL_SUBMIT_CONFIRMATION_KEY,
    value: enabled ? "true" : "false",
  };
}

export function finalSubmitConfirmationReady(enabled: boolean, acknowledged: boolean): boolean {
  return !enabled || acknowledged;
}
