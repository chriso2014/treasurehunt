# ADR-008: Leaflet + OpenStreetMap for the completed-locations map

**Status:** Accepted

## Decision
Use Leaflet with OpenStreetMap tiles. The map shows **only locations the team has completed** (not upcoming ones, not live team position). No API key needed.

## Details
- Each location needs `lat`/`lng` (decimal degrees) in the content file, e.g. copied from Google Maps (right-click on the spot).
- Before anything is completed the map shows `config.map.centre`/`zoom` (Hitchin town centre); afterwards it fits the bounds of completed markers (with padding, max zoom ~17).
- Leaflet uses `[lat, lng]` order. GeoJSON uses `[lng, lat]`. Don't mix them up.
- The seed script rejects locations outside a Hitchin bounding box (roughly lat 51.93–51.97, lng -0.31 to -0.25) to catch typos and swapped or missing minus signs.

## Consequences
- Free and simple. Must display OSM attribution and respect the OSM tile usage policy (fine at this scale).
- Location coordinates are only sent to the client for completed stages, so the map can't leak upcoming destinations.
