import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "cac.deviceId";
const RADIUS_KEY = "cac.radiusKm";

export const RADIUS_OPTIONS = [
  { km: 16, label: "10 mi" },
  { km: 40, label: "25 mi" },
  { km: 100, label: "Bay Area" },
] as const;

export const DEFAULT_RADIUS_KM = 100;

export const radiusLabel = (km: number) =>
  RADIUS_OPTIONS.find((o) => o.km === km)?.label ?? `${Math.round(km / 1.609)} mi`;

type DeviceState = {
  deviceId: string | null;
  radiusKm: number;
  setRadiusKm: (km: number) => void;
};

const DeviceContext = createContext<DeviceState>({ deviceId: null, radiusKm: DEFAULT_RADIUS_KM, setRadiusKm: () => {} });

const newId = () => `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;

export function DeviceProvider({ children }: { children: ReactNode }) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [radiusKm, setRadius] = useState(DEFAULT_RADIUS_KM);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(async (stored) => {
      if (stored) return setDeviceId(stored);
      const id = newId();
      await AsyncStorage.setItem(KEY, id);
      setDeviceId(id);
    });
    AsyncStorage.getItem(RADIUS_KEY).then((stored) => {
      const km = Number(stored);
      if (stored && km > 0) setRadius(km);
    });
  }, []);

  const setRadiusKm = useCallback((km: number) => {
    setRadius(km);
    void AsyncStorage.setItem(RADIUS_KEY, String(km));
  }, []);

  return <DeviceContext.Provider value={{ deviceId, radiusKm, setRadiusKm }}>{children}</DeviceContext.Provider>;
}

export const useDeviceId = () => useContext(DeviceContext).deviceId;

export function useSearchRadius() {
  const { radiusKm, setRadiusKm } = useContext(DeviceContext);
  return { radiusKm, setRadiusKm };
}
