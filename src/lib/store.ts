import { create } from "zustand";

interface Rep {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  title: string | null;
  department: string | null;
  status: string;
  score: number | null;
  confidence: number | null;
  teamId: string | null;
}

interface Filters {
  department: string | null;
  status: string | null;
  minScore: number | null;
}

interface AppState {
  selectedReps: string[];
  filters: Filters;
  sidebarOpen: boolean;
  currentView: string;
  
  setSelectedReps: (ids: string[]) => void;
  toggleRep: (id: string) => void;
  clearSelection: () => void;
  setFilters: (filters: Partial<Filters>) => void;
  clearFilters: () => void;
  setSidebarOpen: (open: boolean) => void;
  setCurrentView: (view: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedReps: [],
  filters: {
    department: null,
    status: null,
    minScore: null,
  },
  sidebarOpen: true,
  currentView: "overview",
  
  setSelectedReps: (ids) => set({ selectedReps: ids }),
  
  toggleRep: (id) => set((state) => ({
    selectedReps: state.selectedReps.includes(id)
      ? state.selectedReps.filter((r) => r !== id)
      : [...state.selectedReps, id],
  })),
  
  clearSelection: () => set({ selectedReps: [] }),
  
  setFilters: (filters) => set((state) => ({
    filters: { ...state.filters, ...filters },
  })),
  
  clearFilters: () => set({
    filters: { department: null, status: null, minScore: null },
  }),
  
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  
  setCurrentView: (view) => set({ currentView: view }),
}));