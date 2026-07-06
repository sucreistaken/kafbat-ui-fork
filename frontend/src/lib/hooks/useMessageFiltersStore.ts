import { LOCAL_STORAGE_KEY_PREFIX } from 'lib/constants';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AdvancedFiltersType = Record<string, AdvancedFilter>;

export interface AdvancedFilter {
  id: string;
  value: string;
  filterCode: string;
}

interface MessageFiltersState {
  filters: AdvancedFiltersType;
  save: (filter: AdvancedFilter) => void;
  nextCursor: string | undefined;
  setNextCursor: (str: string | undefined) => void;
  replace: (filterId: string, filter: AdvancedFilter) => void;
  remove: (id: string) => void;
  removeAll: () => void;
  // "Tum topic'te ara": kullaniciyi tekrar tekrar Next'e bastirmak yerine,
  // bos donen tarama dilimlerini otomatik zincirleriz. scanAll aktifken
  // MessagesTable her tur bitiminde otomatik paginate eder.
  scanAll: boolean;
  setScanAll: (v: boolean) => void;
  // Taranan mesaj sayaci: onceki turlarin toplami (committed) + su anki turun
  // canli degeri (current). Gosterilen = committed + current.
  scannedCommitted: number;
  scannedCurrent: number;
  setScannedCurrent: (n: number) => void;
  commitScanned: () => void;
  resetScan: () => void;
  // Tarih araligi filtresi: "Since time" (FROM_TIMESTAMP) baslangicina ek
  // olarak istege bagli bir bitis zamani (ms). Backend'e gonderilmez; yuklenen
  // mesajlar client-side olarak bu ana kadar kirpilir. null = aralik ust siniri yok.
  rangeEndTimestamp: number | null;
  setRangeEndTimestamp: (v: number | null) => void;
}

export const selectFilter =
  (id?: string) =>
  ({ filters }: MessageFiltersState) => {
    if (!id) return undefined;

    if (filters[id]) return filters[id];
    return undefined;
  };

export const useMessageFiltersStore = create<MessageFiltersState>()(
  persist(
    (set) => ({
      filters: {},
      nextCursor: undefined,
      notPersistedFilter: undefined,
      save: (filter) =>
        set((state) => ({
          filters: { ...state.filters, [filter.id]: filter },
        })),
      replace: (filterId, filter) =>
        set((state) => {
          const newFilters = { ...state.filters };

          if (filterId !== filter.id) {
            delete newFilters[filterId];
          }

          newFilters[filter.id] = filter;

          return { filters: newFilters };
        }),
      remove: (id) =>
        set((state) => {
          const filters = { ...state.filters };
          delete filters[id];

          return { filters };
        }),
      removeAll: () => set(() => ({ filters: {} })),
      setNextCursor: (cursor) => set(() => ({ nextCursor: cursor })),
      scanAll: false,
      setScanAll: (v) => set(() => ({ scanAll: v })),
      scannedCommitted: 0,
      scannedCurrent: 0,
      setScannedCurrent: (n) => set(() => ({ scannedCurrent: n })),
      commitScanned: () =>
        set((state) => ({
          scannedCommitted: state.scannedCommitted + state.scannedCurrent,
          scannedCurrent: 0,
        })),
      resetScan: () =>
        set(() => ({ scanAll: false, scannedCommitted: 0, scannedCurrent: 0 })),
      rangeEndTimestamp: null,
      setRangeEndTimestamp: (v) => set(() => ({ rangeEndTimestamp: v })),
    }),
    {
      name: `${LOCAL_STORAGE_KEY_PREFIX}-message-filters`,
      partialize: (state) => ({ filters: state.filters }),
    }
  )
);
