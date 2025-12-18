import dayjs from "dayjs";
import React, { useState, useRef, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Polygon } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { db } from "./firebase"; 
import { collection, onSnapshot, addDoc, doc } from "firebase/firestore";
import HeatmapLayer from "./HeatmapLayer";
import "./App.css";

// Фикс иконок Leaflet
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const BOT_API_URL = "https://taxibot-uha5.onrender.com/api/points";

const cityCoords = {
  "Москва": [55.7558, 37.6173],
  "Санкт-Петербург": [59.9343, 30.3351],
  "Казань": [55.7887, 49.1221],
  "Новосибирск": [55.0084, 82.9357],
  "Екатеринбург": [56.8389, 60.6057]
};

// --- ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ДЛЯ ГЕНЕРАЦИИ ЗОН ---
const generateRandomZones = (center) => {
  if (!center) return [];
  const zones = [];
  const numZones = Math.floor(Math.random() * 2) + 1; // 1 или 2 зоны

  for (let i = 0; i < numZones; i++) {
    const angle = Math.random() * Math.PI * 2;
    // Радиус от 4 до 10 км (в градусах примерно 0.04 - 0.1)
    const distance = 0.04 + Math.random() * 0.06; 
    const zLat = center.lat + Math.sin(angle) * distance;
    const zLng = center.lng + Math.cos(angle) * distance;

    const points = [];
    const numPoints = 7; // Неровный многоугольник
    for (let p = 0; p < numPoints; p++) {
      const pAngle = (p / numPoints) * Math.PI * 2;
      const pDist = 0.005 + Math.random() * 0.007; 
      points.push([
        zLat + Math.sin(pAngle) * pDist,
        zLng + Math.cos(pAngle) * pDist
      ]);
    }
    zones.push(points);
  }
  return zones;
};

// --- КОМПОНЕНТЫ КАРТЫ ---
const UserLocation = ({ setUserPos }) => {
  const map = useMap();
  useEffect(() => {
    map.locate({ setView: false, watch: true }).on("locationfound", (e) => {
      setUserPos(e.latlng);
    });
  }, [map, setUserPos]);
  return null;
};

const FlyToSpot = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target.position, target.zoom, { duration: 1.2 });
    }
  }, [target, map]);
  return null;
};

// --- КОМПОНЕНТ: ЭКРАН БУСТА ---
const BoostScreen = ({ onStatusChange }) => {
  const [selectedK, setSelectedK] = useState(25);
  const [status, setStatus] = useState("off"); 
  const [timeLeft, setTimeLeft] = useState(3600);
  const [userData, setUserData] = useState(JSON.parse(localStorage.getItem("taxi_user_profile")) || null);
  const [agreed, setAgreed] = useState(false);
  const [showRegModal, setShowRegModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [regForm, setRegForm] = useState({ fio: "", carNumber: "", tariff: "Эконом" });

  // Проверка актуальности аккаунта
  useEffect(() => {
    if (userData && userData.id) {
      const userRef = doc(db, "users", userData.id);
      const unsub = onSnapshot(userRef, (docSnap) => {
        if (!docSnap.exists()) {
          alert("Ваш аккаунт был удален. Пожалуйста, пройдите регистрацию заново.");
          localStorage.removeItem("taxi_user_profile");
          localStorage.removeItem("boost_end_time");
          setUserData(null);
          setStatus("off");
          if (onStatusChange) onStatusChange("off");
        }
      });
      return () => unsub();
    }
  }, [userData, onStatusChange]);

  useEffect(() => {
    const savedEndTime = localStorage.getItem("boost_end_time");
    if (savedEndTime) {
      const remaining = Math.floor((Number(savedEndTime) - Date.now()) / 1000);
      if (remaining > 0) {
        setStatus("on");
        setTimeLeft(remaining);
        if (onStatusChange) onStatusChange("on");
      } else {
        localStorage.removeItem("boost_end_time");
      }
    }
  }, [onStatusChange]);

  useEffect(() => {
    let timer;
    if (status === "on" && timeLeft > 0) {
      timer = setInterval(() => {
        const newTime = timeLeft - 1;
        setTimeLeft(newTime);
        if (newTime <= 0) {
          setStatus("off");
          localStorage.removeItem("boost_end_time");
          if (onStatusChange) onStatusChange("off");
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [status, timeLeft, onStatusChange]);

  const handleToggle = () => {
    if (!agreed) {
      alert("Необходимо принять условия пользовательского соглашения");
      return;
    }
    if (!userData) {
      setShowRegModal(true);
      return;
    }

    if (status === "off") {
      setStatus("loading");
      setTimeout(() => {
        const endTime = Date.now() + 3600 * 1000;
        localStorage.setItem("boost_end_time", endTime.toString());
        setStatus("on");
        setTimeLeft(3600);
        if (onStatusChange) onStatusChange("on");
      }, 5000);
    } else {
      setStatus("off");
      localStorage.removeItem("boost_end_time");
      if (onStatusChange) onStatusChange("off");
    }
  };

  const saveProfile = async () => {
    if (regForm.fio && regForm.carNumber) {
      try {
        const docRef = await addDoc(collection(db, "users"), {
          ...regForm,
          createdAt: new Date().toISOString()
        });
        
        const profileWithId = { ...regForm, id: docRef.id };
        localStorage.setItem("taxi_user_profile", JSON.stringify(profileWithId));
        setUserData(profileWithId);
        setShowRegModal(false);
      } catch (e) {
        alert("Ошибка регистрации. Попробуйте позже.");
      }
    } else {
      alert("Пожалуйста, заполните все данные!");
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="boost-container">
      <div className="boost-card">
        <button className="how-it-works-center" onClick={() => setShowInfoModal(true)}>Как это работает?</button>
        
        <div className="boost-header">
          <span className={`boost-icon ${status === "on" ? "pulsating" : ""}`}>⚡️</span>
          <h1>BOOST ACCOUNT</h1>
          <p className="driver-info">
            {userData ? `${userData.fio} | ${userData.carNumber} (${userData.tariff})` : "Данные отсутствуют"}
          </p>
        </div>

        <div className="boost-options">
          <p>Коэффициент усиления:</p>
          <div className="k-grid">
            {[15, 25, 35].map(k => (
              <button key={k} className={`k-btn ${selectedK === k ? 'active' : ''}`} onClick={() => status === "off" && setSelectedK(k)}>
                +{k}%
              </button>
            ))}
          </div>
        </div>

        <div className="terms-checkbox-container">
          <label className="checkbox-label">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span className="checkbox-custom"></span>
            <span className="checkbox-text">Я согласен с <span className="terms-link" onClick={(e) => { e.preventDefault(); setShowTermsModal(true); }}>Условиями пользования</span></span>
          </label>
        </div>

        <div className="boost-action">
          <button className={`main-boost-btn ${status}`} onClick={handleToggle} disabled={status === "loading"}>
            {status === "off" && "ВКЛЮЧИТЬ"}
            {status === "loading" && "ПОДОЖДИТЕ..."}
            {status === "on" && `АКТИВНО: ${formatTime(timeLeft)}`}
          </button>
        </div>
        
        <p className="legal-disclaimer">
          * Оценочный показатель. Не является публичной офертой.
        </p>
      </div>

      {showRegModal && (
        <div className="modal-overlay">
          <div className="modal boost-reg-modal">
            <h3>Регистрация данных</h3>
            <input placeholder="ФИО водителя" value={regForm.fio} onChange={e => setRegForm({...regForm, fio: e.target.value})} />
            <input placeholder="Гос. номер (А000АА)" value={regForm.carNumber} onChange={e => setRegForm({...regForm, carNumber: e.target.value})} />
            <select value={regForm.tariff} onChange={e => setRegForm({...regForm, tariff: e.target.value})}>
              <option>Эконом</option>
              <option>Комфорт</option>
              <option>Комфорт+</option>
              <option>Элит</option>
            </select>
            <button className="submit-button" onClick={saveProfile}>АКТИВИРОВАТЬ ПРОФИЛЬ</button>
            <button className="close-modal-btn" onClick={() => setShowRegModal(false)}>Назад</button>
          </div>
        </div>
      )}

      {showInfoModal && (
        <div className="modal-overlay" onClick={() => setShowInfoModal(false)}>
          <div className="modal info-modal" onClick={e => e.stopPropagation()}>
            <h3>О режиме Буст</h3>
            <div className="info-content scrollable">
              <p>Режим "буст" используется водителями для увеличения частоты выдачи заказов используемым агрегатором водителю, что может приводить к росту поступающих заказов от клиентов агрегатора.</p>
              <p><strong>ВАЖНО!</strong> Корректная работа данного раздела неразрывно связана с использованием водителем встроенной карты "HotMap", следованию её рекомендаций и нахождения водителя в "фиолетовых зонах" карты.</p>
            </div>
            <button className="submit-button" onClick={() => setShowInfoModal(false)}>ПОНЯТНО</button>
          </div>
        </div>
      )}

      {showTermsModal && (
        <div className="modal-overlay" onClick={() => setShowTermsModal(false)}>
          <div className="modal info-modal" onClick={e => e.stopPropagation()}>
            <h3>Условия использования</h3>
            <div className="info-content scrollable">
              <p><strong>1. Общие положения</strong><br/>Использование модуля осуществляется на риск Пользователя.</p>
              <p><strong>2. Ограничение ответственности</strong><br/>Разработчик не гарантирует 100% рост заказов. Проценты — теоретический показатель мощности алгоритма.</p>
              <p><strong>3. Технические условия</strong><br/>Мы не несем ответственности за работу при плохом интернете или сбоях GPS.</p>
              <p><strong>4. Обязательства</strong><br/>Нужно следовать HotMap и находиться в активных зонах.</p>
              <p><strong>5. Отказ от претензий</strong><br/>Активируя Буст, вы отказываетесь от любых юридических претензий к Разработчику.</p>
            </div>
            <button className="submit-button" onClick={() => setShowTermsModal(false)}>Я ОЗНАКОМЛЕН(А)</button>
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  const [hotspots, setHotspots] = useState([]);
  const [userPos, setUserPos] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const [query, setQuery] = useState("");
  const [newSpot, setNewSpot] = useState({ lat: "", lng: "", label: "", description: "", time: "" });
  const [flyTarget, setFlyTarget] = useState(null);
  const [boostActive, setBoostActive] = useState(false);
  const timerRef = useRef(null);

  const urlParams = new URLSearchParams(window.location.search);
  const userCity = urlParams.get('city') || "Москва";
  const page = urlParams.get('page');

  // Генерация секретных зон через useMemo, чтобы они не пересоздавались при каждом рендере
  const secretZones = useMemo(() => {
    if (boostActive && userPos) {
      return generateRandomZones(userPos);
    }
    return [];
  }, [boostActive, userPos]);

  useEffect(() => {
    if (window.Telegram && window.Telegram.WebApp) {
      window.Telegram.WebApp.ready();
      window.Telegram.WebApp.expand();
    }
  }, []);

  // Проверка статуса буста при загрузке основной страницы
  useEffect(() => {
    const savedEndTime = localStorage.getItem("boost_end_time");
    if (savedEndTime) {
      const remaining = Number(savedEndTime) - Date.now();
      if (remaining > 0) setBoostActive(true);
    }
  }, []);

  const pulseIcon = new L.DivIcon({
    className: "pulse-marker",
    html: `<div class="fire-emoji">🔥</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

  useEffect(() => {
    const unsubFirebase = onSnapshot(collection(db, "hotspots"), (snapshot) => {
      const firebaseData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), source: 'manual' }));
      fetch(BOT_API_URL)
        .then(res => res.json())
        .then(botData => {
          const formattedBotData = botData.map(event => ({
            id: event._id,
            lat: Number(event.lat), 
            lng: Number(event.lng),
            label: event.title,
            description: event.address || "Мероприятие",
            time: dayjs(event.expireAt).format("HH:mm"),
            source: 'auto'
          }));
          setHotspots([...firebaseData, ...formattedBotData]);
        })
        .catch(() => setHotspots(firebaseData));
    });
    return () => unsubFirebase();
  }, []);

  const handleStart = () => {
    timerRef.current = setTimeout(() => {
      setModalOpen(true);
    }, 2000);
  };
  const handleEnd = () => clearTimeout(timerRef.current);

  const handleAddSpot = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "hotspots"), { ...newSpot, city: userCity, lat: parseFloat(newSpot.lat), lng: parseFloat(newSpot.lng), intensity: 5 });
      setNewSpot({ lat: "", lng: "", label: "", description: "", time: "" });
      setModalOpen(false);
    } catch (err) { alert("Ошибка сохранения"); }
  };

  if (page === 'boost') return <BoostScreen onStatusChange={(s) => setBoostActive(s === "on")} />;

  return (
    <div className="App">
      <MapContainer className="map-container" center={cityCoords[userCity] || cityCoords["Москва"]} zoom={11} zoomControl={false}>
        <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
        <UserLocation setUserPos={setUserPos} />
        
        {/* ОТОБРАЖЕНИЕ СЕКРЕТНЫХ ФИОЛЕТОВЫХ ЗОН ПРИ БУСТЕ */}
        {boostActive && secretZones.map((zone, idx) => (
          <Polygon 
            key={idx}
            positions={zone}
            pathOptions={{
              fillColor: '#8e44ad',
              fillOpacity: 0.6,
              color: '#9b59b6',
              weight: 2,
              className: 'pulsating-zone'
            }}
          />
        ))}

        {userPos && <Marker position={userPos} icon={new L.DivIcon({ className: 'user-location-icon', iconSize: [16, 16], iconAnchor: [8, 8] })} />}
        {hotspots.length > 0 && <HeatmapLayer points={hotspots.map(h => [Number(h.lat), Number(h.lng), 0.8])} />}
        {hotspots.map((spot) => (
          <Marker key={spot.id} position={[Number(spot.lat), Number(spot.lng)]} icon={pulseIcon}>
            <Popup>
              <div className="custom-popup">
                <div className="popup-header">{spot.label}</div>
                <div className="popup-time">⏰ До {spot.time}</div>
                <div className="popup-desc">{spot.description}</div>
                <button className="go-button" onClick={() => window.open(`https://yandex.ru/maps/?rtext=~${spot.lat},${spot.lng}&rtt=auto`, "_blank")}>🚀 Поехали!</button>
              </div>
            </Popup>
          </Marker>
        ))}
        {flyTarget && <FlyToSpot target={flyTarget} />}
      </MapContainer>

      <button className="locate-me-btn" onClick={() => userPos && setFlyTarget({ position: [userPos.lat, userPos.lng], zoom: 16 })}>🎯</button>
      <div className="secret-box" onMouseDown={handleStart} onMouseUp={handleEnd} onTouchStart={handleStart} onTouchEnd={handleEnd}>i</div>

      <div className={`bottom-panel ${isPanelCollapsed ? "collapsed" : ""}`}>
        <div className="panel-handle" onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}></div>
        <div className="search-trigger" onClick={() => isPanelCollapsed ? setIsPanelCollapsed(false) : setSearchOpen(true)}>
          <span className="search-icon">🔍</span>
          <span className="search-text">
             Поиск в г. {userCity} {boostActive && <span style={{color: '#8e44ad', marginLeft: '5px'}}>⚡️ BOOST</span>}
          </span>
        </div>
        <div className="panel-content">
          <p className="panel-label">АКТУАЛЬНЫЕ ТОЧКИ 🔥</p>
          <div className="hot-scroll">
            {hotspots.map((spot) => (
              <div key={spot.id} className="hot-card" onClick={() => { setFlyTarget({ id: spot.id, position: [Number(spot.lat), Number(spot.lng)], zoom: 14 }); setIsPanelCollapsed(true); }}>
                <div className="hot-name">{spot.label}</div>
                <div className="hot-subtext">до {spot.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {searchOpen && (
        <div className="search-overlay">
          <div className="search-header">
            <input type="text" placeholder="Поиск места..." value={query} onChange={e => setQuery(e.target.value)} autoFocus />
            <button className="close-search" onClick={() => setSearchOpen(false)}>✕</button>
          </div>
          <div className="search-results-list">
            {hotspots.filter(h => h.label.toLowerCase().includes(query.toLowerCase())).map(spot => (
              <div key={spot.id} className="result-item" onClick={() => { setFlyTarget({ id: spot.id, position: [Number(spot.lat), Number(spot.lng)], zoom: 14 }); setSearchOpen(false); }}>
                <div className="res-title">{spot.label}</div>
                <p className="res-addr">{spot.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Создать точку</h3>
            <input placeholder="Название" onChange={e => setNewSpot({...newSpot, label: e.target.value})} />
            <input placeholder="Описание" onChange={e => setNewSpot({...newSpot, description: e.target.value})} />
            <input placeholder="Время" onChange={e => setNewSpot({...newSpot, time: e.target.value})} />
            <button className="submit-button" onClick={handleAddSpot}>ОПУБЛИКОВАТЬ</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;