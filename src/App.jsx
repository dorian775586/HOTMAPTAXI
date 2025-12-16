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
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [newSpot, setNewSpot] = useState({ lat: "", lng: "", label: "", description: "", time: "" });
  const [flyTarget, setFlyTarget] = useState(null);
  const markerRefs = useRef({});
  const timerRef = useRef(null);

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

  // Логика зажатия кнопки (Secret Button)
  const handleStart = () => {
    timerRef.current = setTimeout(() => {
      setModalOpen(true);
    }, 2000); // 2 секунды удержания
  };
  const handleEnd = () => clearTimeout(timerRef.current);

  const handleAddSpot = async (e) => {
    e.preventDefault();
    if (!newSpot.lat || !newSpot.lng) return alert("Нужны координаты");
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

  return (
    <div className="App">
      {/* Секретная кнопка Инфо */}
      <div 
        className="secret-info-btn"
        onMouseDown={handleStart} 
        onMouseUp={handleEnd} 
        onTouchStart={handleStart} 
        onTouchEnd={handleEnd}
      >
        ⓘ
      </div>

      <MapContainer className="map-container" center={[55.7558, 37.6173]} zoom={11} zoomControl={false}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {hotspots.length > 0 && <HeatmapLayer points={hotspots.map(h => [Number(h.lat), Number(h.lng), 0.8])} />}
        
        {hotspots.map((spot) => (
          <Marker
            key={spot.id}
            position={[Number(spot.lat), Number(spot.lng)]}
            icon={pulseIcon}
            ref={ref => { if (ref) markerRefs.current[spot.id] = ref; }}
          >
            <Popup>
              <div className="custom-popup">
                <div className="popup-header">{spot.label}</div>
                <div className="popup-time">⏰ {spot.time}</div>
                <div className="popup-desc">{spot.description}</div>
                <button className="go-button" onClick={() => window.open(`https://yandex.ru/maps/?rtext=~${spot.lat},${spot.lng}&rtt=auto`, "_blank")}>
                  🚀 Поехали!
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
        {flyTarget && <FlyToSpot target={flyTarget} />}
      </MapContainer>

      <div className={`bottom-panel ${isPanelCollapsed ? "collapsed" : ""}`}>
        <div className="panel-handle" onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}></div>
        
        <div className="search-trigger" onClick={() => isPanelCollapsed ? setIsPanelCollapsed(false) : setSearchOpen(true)}>
          <span className="search-icon">🔍</span>
          <span className="search-text">Куда едем?</span>
        </div>

        <div className="panel-content">
          <p className="panel-label">РЕКОМЕНДУЕМЫЕ МЕСТА 🔥</p>
          <div className="hot-scroll">
            {hotspots.slice(0, 8).map((spot) => (
              <div key={spot.id} className="hot-card" onClick={() => {
                setFlyTarget({ id: spot.id, position: [Number(spot.lat), Number(spot.lng)], zoom: 15 });
                setIsPanelCollapsed(true);
              }}>
                <div className="hot-emoji">🔥</div>
                <div className="hot-info">
                  <span className="hot-name">{spot.label}</span>
                  <span className="hot-subtext">{spot.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {searchOpen && (
        <div className="search-overlay">
          <div className="search-header">
            <button className="close-search" onClick={() => setSearchOpen(false)}>✕</button>
            <input type="text" placeholder="Поиск места..." value={query} onChange={e => setQuery(e.target.value)} autoFocus />
          </div>
          <div className="search-results-list">
            {hotspots.filter(h => (h.label || "").toLowerCase().includes(query.toLowerCase())).map(spot => (
              <div key={spot.id} className="result-item" onClick={() => {
                setFlyTarget({ id: spot.id, position: [Number(spot.lat), Number(spot.lng)], zoom: 16 });
                setSearchOpen(false);
                setIsPanelCollapsed(true);
              }}>
                <span className="res-emoji">🔥</span>
                <div className="res-content">
                  <span className="res-title">{spot.label}</span>
                  <div className="res-details">
                    <span className="res-time">{spot.time}</span>
                    <p className="res-addr">{spot.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 style={{margin: 0}}>Новая точка</h2>
            <input name="label" placeholder="Название" onChange={e => setNewSpot({...newSpot, label: e.target.value})} />
            <input name="description" placeholder="Описание" onChange={e => setNewSpot({...newSpot, description: e.target.value})} />
            <input name="time" placeholder="Время" onChange={e => setNewSpot({...newSpot, time: e.target.value})} />
            <input name="lat" type="number" step="any" placeholder="Широта" onChange={e => setNewSpot({...newSpot, lat: e.target.value})} />
            <input name="lng" type="number" step="any" placeholder="Долгота" onChange={e => setNewSpot({...newSpot, lng: e.target.value})} />
            <button className="submit-button" onClick={handleAddSpot}>Добавить на карту</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;