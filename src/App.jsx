import React, { useState, useRef, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { db } from "./firebase"; 
import { collection, onSnapshot, addDoc } from "firebase/firestore";
import HeatmapLayer from "./HeatmapLayer";
import "./App.css";

// Фикс иконок
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const FlyToSpot = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target.position, target.zoom, { duration: 1.5 });
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
    html: `<div class="fire-emoji">🔥</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "hotspots"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
        ...newSpot,
        lat: parseFloat(newSpot.lat),
        lng: parseFloat(newSpot.lng),
        intensity: 5
      });
      setNewSpot({ lat: "", lng: "", label: "", description: "", time: "" });
      setModalOpen(false);
    } catch (err) { console.error(err); }
  };

  const openYandexNavigator = (lat, lng) => {
    window.open(`https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`, "_blank");
  };

  const validHeatmapPoints = hotspots
    .filter(h => h.lat && h.lng)
    .map(h => [Number(h.lat), Number(h.lng), 0.8]);

  return (
    <div className="App">
      {/* КАРТА ВО ВЕСЬ ЭКРАН */}
      <MapContainer className="map-container" center={[55.7558, 37.6173]} zoom={11} zoomControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png" />
        {validHeatmapPoints.length > 0 && <HeatmapLayer points={validHeatmapPoints} />}
        
        {hotspots.map((spot) => (
          <Marker
            key={spot.id}
            position={[Number(spot.lat), Number(spot.lng)]}
            icon={pulseIcon}
            ref={ref => { if (ref) markerRefs.current[spot.id] = ref; }}
          >
            <Popup>
              <div style={{ textAlign: 'center' }}>
                <strong style={{ fontSize: '16px' }}>{spot.label || "Событие"}</strong><br />
                <span>{spot.description}</span><br />
                <button className="go-button" onClick={() => openYandexNavigator(spot.lat, spot.lng)}>
                  🚀 Поехали!
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
        {flyTarget && <FlyToSpot target={flyTarget} />}
      </MapContainer>

      {/* НИЖНЯЯ ПАНЕЛЬ ТАКСИ */}
      <div className="bottom-panel">
        <div className="panel-handle"></div>
        
        {/* КНОПКА ПОИСКА (КУДА ЕДЕМ?) */}
        <div className="search-trigger" onClick={() => setSearchOpen(true)}>
          <span className="search-icon">🔍</span>
          <span className="search-text">Куда едем?</span>
        </div>

        {/* 5 РАНДОМНЫХ / ПОСЛЕДНИХ ОГОНЬКОВ */}
        <div className="quick-access">
          <p className="panel-label">Рекомендуемые места</p>
          <div className="hot-scroll">
            {hotspots.slice(0, 5).map((spot) => (
              <div key={spot.id} className="hot-card" onClick={() => setFlyTarget({ position: [Number(spot.lat), Number(spot.lng)], zoom: 15 })}>
                <div className="hot-emoji">🔥</div>
                <div className="hot-info">
                  <span className="hot-name">{spot.label || "Точка"}</span>
                  <span className="hot-subtext">{spot.time || "Сейчас"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* КНОПКИ ДЕЙСТВИЙ */}
        <div className="panel-actions">
          <button className="action-btn add-btn" onClick={() => setModalOpen(true)}>Добавить точку</button>
          <button className="action-btn main-btn" onClick={() => alert('Выберите точку на карте!')}>Потежеть!</button>
        </div>
      </div>

      {/* ПОИСКОВОЕ ОКНО */}
      {searchOpen && (
        <div className="search-overlay">
          <div className="search-header">
            <button className="close-search" onClick={() => setSearchOpen(false)}>✕</button>
            <input 
              type="text" placeholder="Введите название..." value={query} 
              onChange={e => setQuery(e.target.value)} autoFocus 
            />
          </div>
          <div className="search-results-list">
            {hotspots
              .filter(h => (h.label || "").toLowerCase().includes(query.toLowerCase()))
              .map(spot => (
                <div key={spot.id} className="result-item" onClick={() => {
                  setFlyTarget({ position: [Number(spot.lat), Number(spot.lng)], zoom: 16 });
                  setSearchOpen(false);
                }}>
                  <span className="res-emoji">🔥</span>
                  <div className="res-content">
                    <span className="res-title">{spot.label}</span>
                    <span className="res-addr">{spot.description}</span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* МОДАЛКА (ТВОЯ СТАРАЯ) */}
      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Новое событие</h2>
            <input name="label" placeholder="Название" onChange={handleInputChange} />
            <input name="description" placeholder="Описание" onChange={handleInputChange} />
            <input name="time" placeholder="Время" onChange={handleInputChange} />
            <input name="lat" type="number" step="any" placeholder="Широта" onChange={handleInputChange} />
            <input name="lng" type="number" step="any" placeholder="Долгота" onChange={handleInputChange} />
            <button className="submit-button" onClick={handleAddSpot}>Добавить</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;