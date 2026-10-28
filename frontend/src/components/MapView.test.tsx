import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import L from 'leaflet';
import { MapView } from './MapView.js';

const map = { fitBounds: vi.fn(), setView: vi.fn(), remove: vi.fn() };
const layer = { addTo: vi.fn(), bindTooltip: vi.fn() };
layer.bindTooltip.mockReturnValue(layer);
vi.mock('leaflet', () => ({
  default: {
    map: vi.fn(() => map),
    tileLayer: vi.fn(() => layer),
    circleMarker: vi.fn(() => layer),
  },
}));

const start = { centre: { lat: 51.949, lng: -0.28 }, zoom: 15 };

describe('MapView', () => {
  it('starts on Hitchin town centre before anything is completed', () => {
    render(<MapView locations={[]} start={start} />);
    expect(map.setView).toHaveBeenCalledWith([51.949, -0.28], 15);
    expect(L.circleMarker).not.toHaveBeenCalled();
  });

  it('marks completed locations in [lat, lng] order and fits them', () => {
    const locations = [
      { name: 'Market Place', lat: 51.949, lng: -0.281 },
      { name: 'St Mary’s', lat: 51.948, lng: -0.279 },
    ];
    render(<MapView locations={locations} start={start} />);
    expect(L.circleMarker).toHaveBeenCalledWith([51.949, -0.281], expect.any(Object));
    expect(layer.bindTooltip).toHaveBeenCalledWith('2. St Mary’s');
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [51.949, -0.281],
        [51.948, -0.279],
      ],
      { padding: [32, 32], maxZoom: 17 },
    );
  });

  it('removes the map when it goes away', () => {
    const { unmount } = render(<MapView locations={[]} start={start} />);
    unmount();
    expect(map.remove).toHaveBeenCalled();
  });
});
