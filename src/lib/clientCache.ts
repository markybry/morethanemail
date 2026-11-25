// What the browser last loaded for each view (a label's email list, sent mail,
// replies you're waiting on), kept in memory for this tab. A view shows it
// straight away when you come back to it. If it came from Gmail only moments
// ago, Gmail isn't asked again at all (fewer calls, so less throttling);
// otherwise it refreshes behind it. Signing out reloads the page, which empties it.
type Entry = { value: unknown; fetchedAt: number };
const store = new Map<string, Entry>();
const MAX = 40; // views remembered; the oldest go first

export function cached<T>(key: string): T | undefined {
  return store.get(key)?.value as T | undefined;
}

// Was it fetched from the server within maxAgeMs?
export function isFresh(key: string, maxAgeMs: number): boolean {
  const e = store.get(key);
  return !!e && Date.now() - e.fetchedAt < maxAgeMs;
}

// fetched: this value has just come from the server (starts its freshness).
// Otherwise it's an edit made here, and keeps the time of the last fetch.
export function remember<T>(key: string, value: T, fetched = false) {
  const fetchedAt = fetched ? Date.now() : (store.get(key)?.fetchedAt ?? 0);
  store.delete(key); // re-inserting keeps the newest last
  store.set(key, { value, fetchedAt });
  while (store.size > MAX) store.delete(store.keys().next().value!);
}

// The Refresh button: forget everything kept here.
export function clearAll() {
  store.clear();
}

// Forget that it's fresh, so the next visit asks the server (after a change
// made elsewhere, say). The copy itself still shows meanwhile.
export function markStale(key: string) {
  const e = store.get(key);
  if (e) e.fetchedAt = 0;
}
