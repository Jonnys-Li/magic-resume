import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { InterviewPrepResult } from "@/lib/interviewPrep";

interface InterviewPrepState {
  clientId: string;
  records: InterviewPrepResult[];
  activeRecordId: string | null;
  addRecord: (record: InterviewPrepResult) => void;
  setRecordsFromCloud: (records: InterviewPrepResult[]) => void;
  deleteRecord: (recordId: string) => void;
  clearRecords: () => void;
  setActiveRecord: (recordId: string | null) => void;
  getMemoryNotes: () => string[];
}

const createClientId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

const byNewest = (records: InterviewPrepResult[]) =>
  [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

const mergeRecords = (
  localRecords: InterviewPrepResult[],
  cloudRecords: InterviewPrepResult[]
) => {
  const map = new Map<string, InterviewPrepResult>();
  [...localRecords, ...cloudRecords].forEach((record) => {
    const existing = map.get(record.id);
    if (!existing) {
      map.set(record.id, record);
      return;
    }

    const existingTime = new Date(existing.createdAt).getTime();
    const incomingTime = new Date(record.createdAt).getTime();
    map.set(record.id, incomingTime >= existingTime ? record : existing);
  });
  return byNewest(Array.from(map.values())).slice(0, 20);
};

export const useInterviewPrepStore = create<InterviewPrepState>()(
  persist(
    (set, get) => ({
      clientId: createClientId(),
      records: [],
      activeRecordId: null,
      addRecord: (record) =>
        set((state) => ({
          records: mergeRecords([record], state.records),
          activeRecordId: record.id,
        })),
      setRecordsFromCloud: (records) =>
        set((state) => ({
          records: mergeRecords(state.records, records),
        })),
      deleteRecord: (recordId) =>
        set((state) => ({
          records: state.records.filter((record) => record.id !== recordId),
          activeRecordId:
            state.activeRecordId === recordId ? null : state.activeRecordId,
        })),
      clearRecords: () => set({ records: [], activeRecordId: null }),
      setActiveRecord: (recordId) => set({ activeRecordId: recordId }),
      getMemoryNotes: () => {
        const notes = get().records.flatMap((record) => record.memoryNotes || []);
        return Array.from(new Set(notes)).slice(0, 10);
      },
    }),
    {
      name: "interview-prep-storage",
      version: 1,
      partialize: (state) => ({
        clientId: state.clientId,
        records: state.records,
        activeRecordId: state.activeRecordId,
      }),
    }
  )
);
