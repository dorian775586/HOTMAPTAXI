import React, { useState, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { db } from "./firebase"; 
import { collection, onSnapshot, addDoc } from "firebase/firestore";
import HeatmapLayer from "./HeatmapLayer";
import "./App.css";

// Фикс иконок Leaflet
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

/* ПЛАВНЫЙ ПЕРЕЛЁТ */
const FlyToSpot = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target.position, target.zoom, { duration: 1.2 });
    }
  }, [target, map]);
  return null;
};

function App() {
  const [hotspots, setHotspots] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [newSpot, setNewSpot] = useState({ lat: "", lng: "", label: "", description: "", time: "" });
  const [flyTarget, setFlyTarget] = useState(null);
  const markerRefs = useRef({});

  const pulseIcon = new L.DivIcon({
    className: "pulse-marker",
    html: `<div style="display: flex; justify-content: center; align-items: center; width: 100%; height: 100%;">🔥</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  useEffect(() => {
    // Подписываемся на данные
    const unsub = onSnapshot(collection(db, "hotspots"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      console.log("Данные из БД обновлены, количество:", data.length);
      setHotspots(data);
    });
    return () => unsub();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewSpot(prev => ({ ...prev, [name]: value }));
  };

  const handleAddSpot = async (e) => {
    e.preventDefault();
    if (!newSpot.lat || !newSpot.lng) return alert("Введите координаты");
    try {
      await addDoc(collection(db, "hotspots"), {
        label: newSpot.label,
        description: newSpot.description,
        time: newSpot.time,
        lat: parseFloat(newSpot.lat),
        lng: parseFloat(newSpot.lng),
        intensity: 5
      });
      setNewSpot({ lat: "", lng: "", label: "", description: "", time: "" });
      setModalOpen(false);
    } catch (err) {
      console.error("Ошибка при добавлении:", err);
    }
  };

  const openYandexNavigator = (lat, lng) => {
    const url = `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`;
    window.open(url, "_blank");
  };

  // Важно: принудительно превращаем координаты в числа для теплового слоя
  const validHeatmapPoints = hotspots
    .filter(h => h.lat && h.lng)
    .map(h => [Number(h.lat), Number(h.lng), 0.8]);

  return (
    <div className="App">
      {/* Счетчик для проверки связи на продакшене */}
      <div style={{
        position: 'absolute', top: 70, left: 20, zIndex: 1000, 
        background: 'white', padding: '5px 10px', borderRadius: '8px', fontSize: '12px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
      }}>
        Точек в базе: {hotspots.length}
      </div>

      <button className="add-button" onClick={() => setModalOpen(true)}>Добавить точку</button>
      <button className="search-toggle" onClick={() => setSearchOpen(!searchOpen)}>🔍</button>

      {searchOpen && (
        <div className="search-box">
          <input 
            type="text" 
            placeholder="Поиск..." 
            value={query} 
            onChange={e => setQuery(e.target.value)} 
            autoFocus 
          />
          <div className="search-results">
            {hotspots
              .filter(h => (h.label || "").toLowerCase().includes(query.toLowerCase()))
              .map(spot => (
                <div key={spot.id} className="search-item" onClick={() => {
                  setFlyTarget({ id: spot.id, position: [Number(spot.lat), Number(spot.lng)], zoom: 16 });
                  setSearchOpen(false);
                  setQuery("");
                }}>
                  {spot.label || "Без названия"}
                </div>
              ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Новое событие</h2>
            <input name="label" placeholder="Название" value={newSpot.label} onChange={handleInputChange} />
            <input name="description" placeholder="Описание" value={newSpot.description} onChange={handleInputChange} />
            <input name="time" placeholder="Время" value={newSpot.time} onChange={handleInputChange} />
            <input name="lat" type="number" step="any" placeholder="Широта" value={newSpot.lat} onChange={handleInputChange} />
            <input name="lng" type="number" step="any" placeholder="Долгота" value={newSpot.lng} onChange={handleInputChange} />
            <button className="submit-button" onClick={handleAddSpot}>Добавить</button>
          </div>
        </div>
      )}

      <MapContainer className="map-container" center={[55.75, 37.61]} zoom={11}>
        {/* КАРТА НА РУССКОМ (OSM Standard) */}
        <TileLayer 
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
          attribution='&copy; OpenStreetMap contributors'
        />

        {validHeatmapPoints.length > 0 && <HeatmapLayer points={validHeatmapPoints} />}

        {hotspots.map((spot) => (
          <Marker
            key={spot.id}
            position={[Number(spot.lat), Number(spot.lng)]}
            icon={pulseIcon}
            ref={ref => { if (ref) markerRefs.current[spot.id] = ref; }}
            eventHandlers={{ click: () => setFlyTarget({ id: spot.id, position: [Number(spot.lat), Number(spot.lng)], zoom: 16 }) }}
          >
            <Popup>
              <strong>{spot.label || "Событие"}</strong><br />
              {spot.description}<br />
              {spot.time}<br />
              <button className="go-button" onClick={() => openYandexNavigator(spot.lat, spot.lng)}>
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