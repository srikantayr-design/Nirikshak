import { useEffect, useRef } from "react";
import { Map as MapLibreMap } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";

import "maplibre-gl/dist/maplibre-gl.css";
import "./LiveMap.css";

const CENTER: [number, number] = [77.5946, 12.9716];

const SATELLITE_STYLE: StyleSpecification = {
  version: 8,

  sources: {
    satellite: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution:
        "Imagery © Esri, Maxar, Earthstar Geographics and the GIS User Community",
    },
  },

  layers: [
    {
      id: "satellite",
      type: "raster",

      source: "satellite",

      paint: {
        "raster-saturation": -0.12,
        "raster-contrast": 0.04,
        "raster-brightness-min": 0.05,
        "raster-brightness-max": 0.92,
      },
    },
  ],
};

export default function LiveMap() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  const cameraTimerRef = useRef<number | null>(null);

  const userInteractedRef = useRef(false);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) {
      return;
    }

    const map = new MapLibreMap({
      container: mapContainer.current,

      style: SATELLITE_STYLE,

      center: CENTER,

      zoom: 13.25,

      pitch: 38,

      bearing: -8,

      attributionControl: false,

      dragPan: true,

      scrollZoom: true,

      doubleClickZoom: true,

      dragRotate: false,

      touchZoomRotate: true,
    });

    mapRef.current = map;

    /*
     * Stop the cinematic camera when the user interacts.
     */

    const stopCinematicMovement = () => {
      userInteractedRef.current = true;

      if (cameraTimerRef.current !== null) {
        window.clearTimeout(cameraTimerRef.current);

        cameraTimerRef.current = null;
      }
    };

    map.on("dragstart", stopCinematicMovement);
    map.on("zoomstart", stopCinematicMovement);

    map.on("load", () => {
      /*
       * Small initial cinematic reveal.
       */

      map.jumpTo({
        center: CENTER,

        zoom: 12.9,

        pitch: 34,

        bearing: -6,
      });

      map.flyTo({
        center: CENTER,

        zoom: 13.25,

        pitch: 38,

        bearing: -8,

        duration: 3200,

        essential: true,
      });

      /*
       * Slowly move the map after loading.
       */

      let direction = 1;

      const cinematicMovement = () => {
        if (!mapRef.current || userInteractedRef.current) {
          return;
        }

        const currentCenter = mapRef.current.getCenter();

        const currentZoom = mapRef.current.getZoom();

        const currentBearing = mapRef.current.getBearing();

        mapRef.current.easeTo({
          center: [
            currentCenter.lng + 0.00024 * direction,

            currentCenter.lat + 0.00004,
          ],

          zoom: currentZoom + 0.006 * direction,

          bearing: currentBearing + 0.025 * direction,

          duration: 8500,

          essential: false,
        });

        direction *= -1;

        cameraTimerRef.current = window.setTimeout(
          cinematicMovement,
          8700
        );
      };

      cameraTimerRef.current = window.setTimeout(
        cinematicMovement,
        4800
      );
    });

    return () => {
      map.off("dragstart", stopCinematicMovement);
      map.off("zoomstart", stopCinematicMovement);

      if (cameraTimerRef.current !== null) {
        window.clearTimeout(cameraTimerRef.current);

        cameraTimerRef.current = null;
      }

      map.remove();

      mapRef.current = null;
    };
  }, []);

  return (
    <section className="live-map">
      {/* =====================================================
          MAP
      ===================================================== */}

      <div
        ref={mapContainer}
        className="map-container"
      />

      {/* =====================================================
          INITIAL FADE / ATMOSPHERE
      ===================================================== */}

      <div className="map-reveal" />

      <div className="map-dark-overlay" />

      {/* =====================================================
          RIGHT SIDE CLOUD / FOG
      ===================================================== */}

      <div className="cloud-layer">
        <div className="cloud cloud-one" />
        <div className="cloud cloud-two" />
        <div className="cloud cloud-three" />
        <div className="cloud cloud-four" />
        <div className="cloud cloud-five" />
      </div>

      {/* =====================================================
          TOP RIGHT STATUS
      ===================================================== */}

      <div className="monitoring-badge">
        <span className="monitoring-dot" />

        <span>LIVE MONITORING</span>
      </div>

      {/* =====================================================
          DISASTER MANAGEMENT IDENTITY
      ===================================================== */}

      <div className="system-identity">
        <div className="identity-symbol">
          +
        </div>

        <div className="identity-text">
          <div className="identity-title">
            D-MGM
          </div>

          <div className="identity-subtitle">
            DISASTER MANAGEMENT
            <span> &amp; </span>
            INFRASTRUCTURE MONITORING
          </div>
        </div>
      </div>

      {/* =====================================================
          BOTTOM INFORMATION
      ===================================================== */}

      <div className="map-information">
        <div className="map-information-title">
          URBAN RESILIENCE NETWORK
        </div>

        <div className="map-information-subtitle">
          REAL-TIME DISASTER INTELLIGENCE
        </div>
      </div>

      {/* =====================================================
          VIGNETTE
      ===================================================== */}

      <div className="map-vignette" />
    </section>
  );
}