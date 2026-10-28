import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TeamState } from '@treasurehunt/shared';

type Props = {
  locations: TeamState['completedLocations'];
  start: TeamState['map'];
};

// Leaflet + OpenStreetMap (ADR-008). Only completed locations are ever sent by the server, so
// the map can't give away where to go next. Circle markers avoid Leaflet's marker image files; a dashed line joins them in order.
/** Text alternative: the places in the order found, since the tooltips aren't reachable. */
const label = (locations: Props['locations']): string =>
  locations.length === 0
    ? 'Map of Hitchin'
    : `Map of places you’ve found, in order: ${locations.map((l) => l.name).join(', ')}`;

export const MapView = ({ locations, start }: Props) => {
  const element = useRef<HTMLDivElement>(null);
  // Rebuild only when the places change, not on every poll that brings an equal state.
  const key = JSON.stringify({ locations, start });

  useEffect(() => {
    if (!element.current) return;
    const { locations, start } = JSON.parse(key) as Props;
    const map = L.map(element.current, { scrollWheelZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    // Leaflet takes [lat, lng].
    const points = locations.map((l): [number, number] => [l.lat, l.lng]);
    // The route so far: straight lines between places in the order they were found.
    if (points.length > 1) {
      L.polyline(points, { color: '#fbbf24', weight: 4, opacity: 0.8, dashArray: '8 8' }).addTo(
        map,
      );
    }
    locations.forEach((l, i) => {
      L.circleMarker([l.lat, l.lng], {
        radius: 10,
        color: '#fbbf24',
        fillColor: '#f59e0b',
        fillOpacity: 0.9,
      })
        .bindTooltip(`${i + 1}. ${l.name}`)
        .addTo(map);
    });
    if (points.length > 0) {
      map.fitBounds(points, { padding: [32, 32], maxZoom: 17 });
    } else {
      map.setView([start.centre.lat, start.centre.lng], start.zoom);
    }
    return () => void map.remove();
  }, [key]);

  return (
    <div
      ref={element}
      role="img"
      aria-label={label(locations)}
      className="h-72 w-full overflow-hidden rounded-2xl"
    />
  );
};
