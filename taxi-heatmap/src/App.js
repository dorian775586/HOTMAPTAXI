import React, { useState, useRef, useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

import "./App.css";
import initialHotspots from "./data/hotspots";

// фикс стандартных иконок Leaflet
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

/* ===== КОМПОНЕНТ ДЛЯ ПЛАВНОГО ПЕРЕЛЁТА ===== */
const FlyToSpot = ({ target }) => {
  const map = useMap();

  useEffect(() => {
    if (!target) return;

    map.flyTo(target.position, target.zoom, {
      duration: 1.2,
    });
  }, [target, map]);

  return null;
};

function App() {
  const [hotspots, setHotspots] = useState(initialHotspots);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  const [newSpot, setNewSpot] = useState({
    lat: "",
    lng: "",
    label: "",
    description: "",
    time: "",
  });

  const [flyTarget, setFlyTarget] = useState(null);
  const markerRefs = useRef({});

  const pulseIcon = new L.DivIcon({
    className: "pulse-marker",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  /* ===== ОТКРЫТИЕ POPUP ПОСЛЕ ПЕРЕЛЁТА ====== */
  useEffect(() => {
    if (flyTarget && markerRefs.current[flyTarget.id]) {
      markerRefs.current[flyTarget.id].openPopup();
    }
  }, [flyTarget]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewSpot({ ...newSpot, [name]: value });
  };

  const handleAddSpot = (e) => {
    e.preventDefault();
    const id = hotspots.length ? hotspots[hotspots.length - 1].id + 1 : 1;

    setHotspots([
      ...hotspots,
      {
        ...newSpot,
        id,
        lat: parseFloat(newSpot.lat),
        lng: parseFloat(newSpot.lng),
      },
    ]);

    setNewSpot({ lat: "", lng: "", label: "", description: "", time: "" });
    setModalOpen(false);
  };

  const filteredHotspots = hotspots.filter((h) =>
    h.label.toLowerCase().includes(query.toLowerCase())
  );

  const handleMarkerClick = (spot) => {
    setFlyTarget({
      id: spot.id,
      position: [spot.lat, spot.lng],
      zoom: 16,
    });
  };

  const handleSearchSelect = (spot) => {
    setFlyTarget({
      id: spot.id,
      position: [spot.lat, spot.lng],
      zoom: 16,
    });
    setSearchOpen(false);
    setQuery("");
  };

  /* ===== ОТКРЫТИЕ ЯНДЕКС НАВИГАТОРА В НОВОЙ ВКЛАДКЕ С GPS ===== */
  const openYandexNavigator = (latTo, lngTo) => {
    if (!navigator.geolocation) {
      alert("GPS не доступен");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latFrom = position.coords.latitude;
        const lngFrom = position.coords.longitude;

        const url = `https://yandex.ru/maps/?rtext=${latFrom},${lngFrom}~${latTo},${lngTo}&rtt=auto`;

        window.open(url, "_blank"); // открываем в новой вкладке
      },
      () => {
        // если GPS недоступен, строим маршрут без текущей позиции
        const url = `https://yandex.ru/maps/?rtext=~${latTo},${lngTo}&rtt=auto`;
        window.open(url, "_blank");
      }
    );
  };

  return (
    <div className="App">
      {/* КНОПКИ */}
      <button className="add-button" onClick={() => setModalOpen(true)}>
        Добавить точку
      </button>

      <button
        className="search-toggle"
        onClick={() => setSearchOpen((v) => !v)}
      >
        🔍
      </button>

      {/* ПОИСК */}
      {searchOpen && (
        <div className="search-box">
          <input
            type="text"
            placeholder="Поиск..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="search-results">
            {filteredHotspots.map((spot) => (
              <div
                key={spot.id}
                className="search-item"
                onClick={() => handleSearchSelect(spot)}
              >
                {spot.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* МОДАЛКА */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Новое событие</h2>
            <input
              name="label"
              placeholder="Название"
              value={newSpot.label}
              onChange={handleInputChange}
            />
            <input
              name="description"
              placeholder="Описание"
              value={newSpot.description}
              onChange={handleInputChange}
            />
            <input
              name="time"
              placeholder="Время"
              value={newSpot.time}
              onChange={handleInputChange}
            />
            <input
              name="lat"
              type="number"
              placeholder="Широта"
              value={newSpot.lat}
              onChange={handleInputChange}
            />
            <input
              name="lng"
              type="number"
              placeholder="Долгота"
              value={newSpot.lng}
              onChange={handleInputChange}
            />
            <button className="submit-button" onClick={handleAddSpot}>
              Добавить
            </button>
          </div>
        </div>
      )}

      {/* КАРТА */}
      <MapContainer
        className="map-container"
        center={[55.751244, 37.618423]}
        zoom={12}
      >
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />

        {hotspots.map((spot) => (
          <Marker
            key={spot.id}
            position={[spot.lat, spot.lng]}
            icon={pulseIcon}
            ref={(ref) => {
              if (ref) markerRefs.current[spot.id] = ref;
            }}
            eventHandlers={{
              click: () => handleMarkerClick(spot),
            }}
          >
            <Popup>
              <strong>{spot.label}</strong>
              <br />
              {spot.description}
              <br />
              {spot.time}
              <br />
              <button
                className="go-button"
                onClick={() => openYandexNavigator(spot.lat, spot.lng)}
              >
                Поехали!
              </button>
            </Popup>
          </Marker>
        ))}

        {flyTarget && <FlyToSpot target={flyTarget} />}
      </MapContainer>
    </div>
  );
}

export default App;
