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

  useEffect(() => {
    if (flyTarget && flyTarget.id && markerRefs.current[flyTarget.id]) {
      setTimeout(() => {
        markerRefs.current[flyTarget.id].openPopup();
      }, 1600);
    }
  }, [flyTarget]);

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

  return (
    <div className="App">
      <MapContainer className="map-container" center={[55.7558, 37.6173]} zoom={11} zoomControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
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
                <div className="popup-header">{spot.label || "Событие"}</div>
                <div className="popup-time">⏰ {spot.time || "Сейчас"}</div>
                <div className="popup-desc">{spot.description}</div>
                <button className="go-button" onClick={() => openYandexNavigator(spot.lat, spot.lng)}>
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
        
        <div className="search-trigger" onClick={() => { 
          if(isPanelCollapsed) setIsPanelCollapsed(false);
          else setSearchOpen(true);
        }}>
          <span className="search-icon">🔍</span>
          <span className="search-text">Куда едем?</span>
        </div>

        <div className="panel-content">
          <div className="quick-access">
            <p className="panel-label">РЕКОМЕНДУЕМЫЕ МЕСТА 🔥</p>
            <div className="hot-scroll">
              {hotspots.slice(0, 5).map((spot) => (
                <div key={spot.id} className="hot-card" onClick={() => {
                  setFlyTarget({ id: spot.id, position: [Number(spot.lat), Number(spot.lng)], zoom: 14 });
                  setIsPanelCollapsed(true);
                }}>
                  <div className="hot-emoji">🔥</div>
                  <div className="hot-info">
                    <span className="hot-name">{spot.label || "Точка"}</span>
                    <span className="hot-subtext">{spot.time || "Сейчас"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel-actions">
            <button className="action-btn add-btn" onClick={() => setModalOpen(true)}>Добавить точку</button>
            <button className="action-btn main-btn" onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}>
                {isPanelCollapsed ? "РАЗВЕРНУТЬ" : "ПОГНАЛИ!"}
            </button>
          </div>
        </div>
      </div>

      {searchOpen && (
        <div className="search-overlay">
          <div className="search-header">
            <button className="close-search" onClick={() => setSearchOpen(false)}>✕</button>
            <input type="text" placeholder="Введите название..." value={query} onChange={e => setQuery(e.target.value)} autoFocus />
          </div>
          <div className="search-results-list">
            {hotspots.filter(h => (h.label || "").toLowerCase().includes(query.toLowerCase())).map(spot => (
              <div key={spot.id} className="result-item" onClick={() => {
                setFlyTarget({ id: spot.id, position: [Number(spot.lat), Number(spot.lng)], zoom: 15 });
                setSearchOpen(false);
                setIsPanelCollapsed(true);
              }}>
                <span className="res-emoji">🔥</span>
                <div className="res-content">
                  <span className="res-title">{spot.label}</span>
                  <span className="res-addr">{spot.time} — {spot.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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