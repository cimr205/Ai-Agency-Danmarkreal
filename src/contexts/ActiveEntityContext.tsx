import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ActiveEntityType = "customer" | "lead" | "deal" | "task";

export interface ActiveEntity {
  type: ActiveEntityType;
  id: string;
  label: string;
}

interface ActiveEntityContextValue {
  entity: ActiveEntity | null;
  setEntity: (entity: ActiveEntity) => void;
  clearEntity: (id: string) => void;
}

const ActiveEntityContext = createContext<ActiveEntityContextValue | null>(null);

// Minimal cross-page "what is the user looking at" signal for the Operating
// Manager Context Panel. Leads/Deals don't have their own detail routes
// (they open as in-page sheets), so route-based detection alone isn't
// enough — pages that open a detail view report it here, and clear it by
// their own id so a stale close from an already-replaced entity can't wipe
// out a newer one.
export function ActiveEntityProvider({ children }: { children: ReactNode }) {
  const [entity, setEntityState] = useState<ActiveEntity | null>(null);
  const currentIdRef = useRef<string | null>(null);

  const setEntity = useCallback((next: ActiveEntity) => {
    currentIdRef.current = next.id;
    setEntityState(next);
  }, []);

  const clearEntity = useCallback((id: string) => {
    if (currentIdRef.current !== id) return;
    currentIdRef.current = null;
    setEntityState(null);
  }, []);

  const value = useMemo(() => ({ entity, setEntity, clearEntity }), [entity, setEntity, clearEntity]);
  return <ActiveEntityContext.Provider value={value}>{children}</ActiveEntityContext.Provider>;
}

export function useActiveEntity() {
  const ctx = useContext(ActiveEntityContext);
  if (!ctx) throw new Error("useActiveEntity must be used within ActiveEntityProvider");
  return ctx;
}
