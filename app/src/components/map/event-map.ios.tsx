import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { nextInGroup } from "./model";
import type { EventMapProps } from "./types";

export default function EventMap({ center, radiusKm, recenter, markers, selectedId, onSelect, palette, dark }: EventMapProps) {
  const ref = useRef<MapView>(null);
  useEffect(() => {
    ref.current?.animateToRegion({ latitude: center.lat, longitude: center.lng, latitudeDelta: radiusKm / 45, longitudeDelta: radiusKm / 35 }, 350);
  }, [center.lat, center.lng, radiusKm, recenter]);
  return (
    <MapView ref={ref} style={{ flex: 1 }} userInterfaceStyle={dark ? "dark" : "light"}
      initialRegion={{ latitude: center.lat, longitude: center.lng, latitudeDelta: radiusKm / 45, longitudeDelta: radiusKm / 35 }}
      showsUserLocation={false} testID="event-map" accessibilityLabel="Event locations. Use the event selector below for an accessible list.">
      {markers.map((marker) => {
        const selected = marker.ids.includes(selectedId ?? "");
        return <Marker key={marker.ids.join(",")} coordinate={{ latitude: marker.lat, longitude: marker.lng }} zIndex={selected ? 1000 : marker.saved ? 500 : 0}
          accessibilityLabel={`${marker.ids.length} event${marker.ids.length === 1 ? "" : "s"}${marker.saved ? ", includes saved" : ""}`}
          onPress={() => onSelect(nextInGroup(marker.ids, selectedId))}>
          <View style={{ borderRadius: 24, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 3, borderColor: selected ? palette.ink : palette.white, backgroundColor: marker.saved ? palette.gold : palette.ember }}>
            <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>{marker.ids.length > 1 ? marker.ids.length : "●"}</Text>
          </View>
        </Marker>;
      })}
    </MapView>
  );
}
