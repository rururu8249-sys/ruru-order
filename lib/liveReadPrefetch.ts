/** First-entry reads only: share an in-flight/recent response once, never persist chat or permissions. */
export function createLiveReadPrefetch(
  read: (url: string) => Promise<any>,
  now: () => number = Date.now,
) {
  const pending = new Map<string, { at: number; promise: Promise<any> }>();
  return {
    preload(url: string) {
      const old = pending.get(url);
      if (old && now() - old.at < 10_000) return;
      if (pending.size >= 4) pending.delete(pending.keys().next().value!);
      const entry = { at: now(), promise: read(url) };
      pending.set(url, entry);
      void entry.promise.catch(() => { if (pending.get(url) === entry) pending.delete(url); });
    },
    take(url: string) {
      const entry = pending.get(url);
      pending.delete(url);
      return entry && now() - entry.at < 10_000 ? entry.promise : read(url);
    },
  };
}
