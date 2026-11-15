import type { Palette } from "@/constants/theme";
import type { Coordinates, MarkerGroup } from "./model";

export type EventMapProps = {
  center: Coordinates;
  radiusKm: number;
  recenter: number;
  markers: MarkerGroup[];
  selectedId?: string;
  onSelect: (id: string) => void;
  palette: Palette;
  dark: boolean;
};
