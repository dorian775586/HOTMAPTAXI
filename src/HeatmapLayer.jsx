// src/HeatmapLayer.jsx
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet'; // Импортируем сам Leaflet
import 'leaflet.heat';   // Подключаем плагин тепловой карты

const HeatmapLayer = ({ points, options }) => {
  const map = useMap();

  useEffect(() => {
    // Проверяем наличие карты, точек и самого метода heatLayer
    if (!map || points.length === 0 || !L.heatLayer) {
      console.log("Слой не готов:", { map: !!map, points: points.length, method: !!L.heatLayer });
      return;
    }

    // Создаем слой. Используем L.heatLayer напрямую вместо window.L
    const heat = L.heatLayer(points, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      ...options
    });

    heat.addTo(map);

    return () => {
      if (map && heat) {
        map.removeLayer(heat);
      }
    };
  }, [map, points, options]);

  return null;
};

export default HeatmapLayer;