import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const KEY = "cac.deviceId";
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
