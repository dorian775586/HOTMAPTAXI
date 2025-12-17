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

// --- КОНСТАНТЫ И НАСТРОЙКИ ---
// ЗАМЕНИ НА СВОЙ URL ИЗ RENDER (обязательно с /api/points на конце)
const BOT_API_URL = "https://taxibot-uha5.onrender.com/api/points";

const cityCoords = {
  "Москва": [55.7558, 37.6173],
  "Санкт-Петербург": [59.9343, 30.3351],
  "Казань": [55.7887, 49.1221]
};

const FlyToSpot = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target.position, target.zoom, { duration: 1.2, easeLinearity: 0.25 });
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

  // Получаем город из параметров URL
  const urlParams = new URLSearchParams(window.location.search);
  const userCity = urlParams.get('city') || "Москва";
  const defaultCenter = cityCoords[userCity] || cityCoords["Москва"];

  // --- ИНТЕГРАЦИЯ TELEGRAM WEB APP ---
  useEffect(() => {
    if (window.Telegram && window.Telegram.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();
      tg.setHeaderColor("#ffffff");
    }
  }, []);

  const pulseIcon = new L.DivIcon({
    className: "pulse-marker",
    html: `<div class="fire-emoji">🔥</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  // --- ЗАГРУЗКА ДАННЫХ (FIREBASE + BOT API) ---
  useEffect(() => {
    // 1. Подписка на ручные точки из Firebase
    const unsubFirebase = onSnapshot(collection(db, "hotspots"), (snapshot) => {
      const firebaseData = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data(), source: 'manual' }))
        .filter(item => item.city === userCity || !item.city);

      // 2. Запрос к API бота за авто-точками
      fetch(`${BOT_API_URL}?city=${encodeURIComponent(userCity)}`)
        .then(res => res.json())
        .then(botData => {
          const formattedBotData = botData.map(event => ({
            id: event._id,
            lat: event.lat,
            lng: event.lng,
            label: event.title,
            description: event.address || "Мероприятие",
            time: dayjs(event.expireAt).format("HH:mm"),
            source: 'auto'
          }));

          setHotspots([...firebaseData, ...formattedBotData]);
        })
        .catch(err => {
          console.error("Ошибка API бота:", err);
          setHotspots(firebaseData);
        });
    });

    return () => unsubFirebase();
  }, [userCity]);

  // Остальная логика перемещения по клику
  useEffect(() => {
    if (flyTarget && flyTarget.id && markerRefs.current[flyTarget.id]) {
      setTimeout(() => {
        markerRefs.current[flyTarget.id].openPopup();
      }, 1300);
    }
  }, [flyTarget]);

  const handleStart = () => {
    timerRef.current = setTimeout(() => {
      setModalOpen(true);
      if (window.navigator.vibrate) window.navigator.vibrate(60);
    }, 2000);
  };
  const handleEnd = () => clearTimeout(timerRef.current);

  const handleAddSpot = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "hotspots"), {
        ...newSpot,
        city: userCity,
        lat: parseFloat(newSpot.lat),
        lng: parseFloat(newSpot.lng),
        intensity: 5
      });
      setNewSpot({ lat: "", lng: "", label: "", description: "", time: "" });
      setModalOpen(false);
    } catch (err) { alert("Ошибка сохранения"); }
  };

  return (
    <div className="App">
      <MapContainer className="map-container" center={defaultCenter} zoom={11} zoomControl={false}>
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
                <div className="popup-header">{spot.label}</div>
                <div className="popup-time">⏰ До {spot.time}</div>
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

      {/* Секретная кнопка добавления */}
      <div className="secret-box" onMouseDown={handleStart} onMouseUp={handleEnd} onTouchStart={handleStart} onTouchEnd={handleEnd}>i</div>

      {/* Нижняя панель */}
      <div className={`bottom-panel ${isPanelCollapsed ? "collapsed" : ""}`}>
        <div className="panel-handle" onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}></div>
        
        <div className="search-trigger" onClick={() => isPanelCollapsed ? setIsPanelCollapsed(false) : setSearchOpen(true)}>
          <span className="search-icon">🔍</span>
          <span className="search-text">Куда едем в г. {userCity}?</span>
        </div>

        <div className="panel-content">
          <p className="panel-label">АКТУАЛЬНЫЕ ТОЧКИ 🔥</p>
          <div className="hot-scroll">
            {hotspots.map((spot) => (
              <div key={spot.id} className="hot-card" onClick={() => {
                setFlyTarget({ id: spot.id, position: [Number(spot.lat), Number(spot.lng)], zoom: 14 });
                setIsPanelCollapsed(true);
              }}>
                <div className="hot-emoji">{spot.source === 'auto' ? '🎭' : '🔥'}</div>
                <div className="hot-info">
                  <span className="hot-name">{spot.label}</span>
                  <span className="hot-subtext">до {spot.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Модалки поиска и добавления (без изменений) */}
      {searchOpen && (
        <div className="search-overlay">
          <div className="search-header">
            <input type="text" placeholder="Поиск места..." value={query} onChange={e => setQuery(e.target.value)} autoFocus />
            <button className="close-search" onClick={() => setSearchOpen(false)}>✕</button>
          </div>
          <div className="search-results-list">
            {hotspots.filter(h => h.label.toLowerCase().includes(query.toLowerCase())).map(spot => (
              <div key={spot.id} className="result-item" onClick={() => {
                setFlyTarget({ id: spot.id, position: [Number(spot.lat), Number(spot.lng)], zoom: 14 });
                setSearchOpen(false);
                setIsPanelCollapsed(true);
              }}>
                <span className="res-emoji">📍</span>
                <div className="res-content">
                  <div className="res-row-main">
                    <span className="res-title">{spot.label}</span>
                  </div>
                  <p className="res-addr">{spot.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Создать точку ({userCity})</h3>
            <input placeholder="Название" onChange={e => setNewSpot({...newSpot, label: e.target.value})} />
            <input placeholder="Описание" onChange={e => setNewSpot({...newSpot, description: e.target.value})} />
            <input placeholder="Время (напр. 21:00)" onChange={e => setNewSpot({...newSpot, time: e.target.value})} />
            <div className="coords-row">
              <input type="number" step="any" placeholder="Широта" onChange={e => setNewSpot({...newSpot, lat: e.target.value})} />
              <input type="number" step="any" placeholder="Долгота" onChange={e => setNewSpot({...newSpot, lng: e.target.value})} />
            </div>
            <button className="submit-button" onClick={handleAddSpot}>ОПУБЛИКОВАТЬ</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;