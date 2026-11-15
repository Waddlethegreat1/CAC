import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMutation, useQuery } from "convex/react";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

import { api } from "@/convex/_generated/api";

const KEY = "cac.deviceId";

export const RADIUS_OPTIONS = [
  { km: 16, label: "10 mi" },
  { km: 40, label: "25 mi" },
  { km: 100, label: "Bay Area" },
] as const;

export const DEFAULT_RADIUS_KM = 100;

export const radiusLabel = (km: number) =>
  RADIUS_OPTIONS.find((o) => o.km === km)?.label ?? `${Math.round(km / 1.609)} mi`;

const DeviceContext = createContext<string | null>(null);

const newId = () => `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(async (stored) => {
      if (stored) return setDeviceId(stored);
      const id = newId();
      await AsyncStorage.setItem(KEY, id);
      setDeviceId(id);
    });
  }, []);
  return <DeviceContext.Provider value={deviceId}>{children}</DeviceContext.Provider>;
}

export const useDeviceId = () => useContext(DeviceContext);

export function useSearchRadius() {
  const deviceId = useDeviceId();
  const user = useQuery(api.users.get, deviceId ? { deviceId } : "skip");
  const upsert = useMutation(api.users.upsert);
  const [draft, setDraft] = useState<number | null>(null);

  const setRadiusKm = useCallback(
    async (km: number) => {
      setDraft(km);
      if (!user) return;
      const { _id, _creationTime, updatedAt, ...profile } = user;
      await upsert({ ...profile, radiusKm: km });
    },
    [user, upsert],
  );

  return { radiusKm: draft ?? user?.radiusKm ?? DEFAULT_RADIUS_KM, setRadiusKm };
}
