export function eventSaveError(error: {code?: string; message?: string} | null, fallback: string): string {
  const message = error?.message || fallback;
  if (error?.code === '23514' && message.includes('spin_duration_ms')) {
    return '이벤트 진행시간 DB 설정이 맞지 않아 저장하지 못했습니다. 이벤트 진행시간 마이그레이션 적용이 필요합니다.';
  }
  if (['42703', 'PGRST204'].includes(error?.code || '') && /survivor_nicknames|winner_count/.test(message)) {
    return '서바이벌 결과 저장용 DB 컬럼이 없습니다. event_survival_columns.sql 적용이 필요합니다.';
  }
  return fallback;
}
