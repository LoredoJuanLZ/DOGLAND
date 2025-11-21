// --- ELEMENTOS DEL DOM ---
const menuSection = document.getElementById('menu-selection');
const registerForm = document.getElementById('register-form');
const adminLoginForm = document.getElementById('admin-login-form');
const viewerMap = document.getElementById('viewer-map');
const videoScreen = document.getElementById('video-screen');
const remoteVideo = document.getElementById('remote-video');
const statusMsg = document.getElementById('status-msg');
const videoInfoText = document.getElementById('video-info-text');
const manualInputBox = document.getElementById('manual-input-box');
const mapStatusText = document.getElementById('map-status-text');

// --- DEBUG Oculto (Opcional) ---
// Puedes descomentar esto si necesitas ver logs en el móvil
const debugBox = document.createElement('div');
debugBox.style.cssText = "position:fixed; bottom:0; left:0; width:100%; height:0px; background:rgba(0,0,0,0.8); color:#0f0; font-size:10px; overflow:hidden; z-index:9999; pointer-events:none; padding:0px;";
document.body.appendChild(debugBox);

function log(msg) {
    console.log(msg);
    // const time = new Date().toLocaleTimeString();
    // debugBox.innerHTML = `<div>[${time}] ${msg}</div>` + debugBox.innerHTML;
}

// --- CONFIGURACIÓN ---
let peer; 
let localStream;
let scanInterval; // Para detener el escaneo al salir del mapa

// Estado de la sesión actual
let currentPetName = "";
let currentSpecies = "";
let currentLocation = "";

const APP_PREFIX = "dogland-ios-v8-"; 

const peerConfig = {
    debug: 0, // 0 prod, 2 debug
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:stun1.l.google.com:19302' }
        ]
    }
};

// Lista de habitaciones fijas para escanear en el mapa
const fixedRooms = [
    'recepcion', 'juegos', 'vet', 'bano',
    'gato1', 'gato2', 'gato3', 'gato4', 'gato5',
    'perroA1', 'perroA2', 'perroA3', 'perroA4', 'perroA5',
    'perroB1', 'perroB2', 'perroB3', 'perroB4', 'perroB5'
];

// --- UI FUNCTIONS ---

function uiShowLogin() { 
    menuSection.classList.add('hidden'); 
    adminLoginForm.classList.remove('hidden'); 
}

function uiShowMap() { 
    resetApp(); // Limpiar conexiones previas
    menuSection.classList.add('hidden'); 
    videoScreen.classList.add('hidden');
    viewerMap.classList.remove('hidden'); 
    
    // INICIAR ESCANEO DE CÁMARAS ACTIVAS
    checkActiveCameras();
}

function uiShowRegistrationForm() { 
    adminLoginForm.classList.add('hidden'); 
    registerForm.classList.remove('hidden'); 
}

function uiGoBack() { 
    resetApp();
    location.reload(); 
}

function resetApp() {
    if(peer) { peer.destroy(); peer = null; }
    if(localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if(scanInterval) { clearInterval(scanInterval); }
    remoteVideo.srcObject = null;
}

function cleanId(input) {
    return input.trim().toLowerCase().replace(/\s/g, '');
}

function toggleManualInput() {
    manualInputBox.classList.toggle('hidden');
}

// Toggle entre Modo Fijo y Custom en el Admin
function toggleStreamType() {
    const type = document.querySelector('input[name="streamType"]:checked').value;
    if(type === 'fixed') {
        document.getElementById('fixed-room-section').classList.remove('hidden');
        document.getElementById('custom-room-section').classList.add('hidden');
    } else {
        document.getElementById('fixed-room-section').classList.add('hidden');
        document.getElementById('custom-room-section').classList.remove('hidden');
    }
}

// --- LOGICA DE LOGIN ADMIN ---
function checkAdminAuth() {
    const u = document.getElementById('admin-user').value;
    const p = document.getElementById('admin-pass').value;
    if(u === "admin" && p === "admin123") {
        uiShowRegistrationForm(); 
    } else {
        alert("Credenciales incorrectas 🚫");
    }
}

// --- MODO CÁMARA (TRANSMISOR) ---
function startCameraMode() {
    const type = document.querySelector('input[name="streamType"]:checked').value;
    let cleanName, displayName, species;

    if (type === 'fixed') {
        const select = document.getElementById('reg-room-id');
        cleanName = select.value;
        displayName = select.options[select.selectedIndex].text;
        species = cleanName.includes('gato') ? '🐱' : (cleanName.includes('perro') ? '🐶' : '📹');
    } else {
        // Modo Custom
        const rawName = document.getElementById('custom-pet-name').value;
        if (!rawName) return alert("Ingresa un nombre.");
        cleanName = cleanId(rawName);
        displayName = rawName.toUpperCase();
        species = document.getElementById('custom-pet-type').value;
    }

    const fullId = APP_PREFIX + cleanName;

    // UI Update
    registerForm.classList.add('hidden');
    videoScreen.classList.remove('hidden');
    videoInfoText.innerHTML = `🔴 TRANSMITIENDO: ${displayName}`;
    statusMsg.innerText = "Iniciando cámara...";
    
    // Guardar estado global
    currentPetName = displayName;
    currentSpecies = species;
    currentLocation = cleanName;

    // Iniciar Media
    navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }, 
        audio: true 
    })
    .then(stream => {
        localStream = stream;
        remoteVideo.srcObject = stream;
        remoteVideo.muted = true; 
        
        peer = new Peer(fullId, peerConfig);

        peer.on('open', (id) => {
            statusMsg.innerText = `✅ EN VIVO | ID: ${cleanName}`;
            statusMsg.style.color = "#2ecc71";
        });

        peer.on('connection', (conn) => {
            // Cuando alguien se conecta al chat de datos, le enviamos info de quién somos
            conn.on('open', () => {
                conn.send({
                    type: 'info',
                    name: currentPetName,
                    species: currentSpecies,
                    location: currentLocation
                });
            });
        });

        peer.on('call', (call) => {
            call.answer(localStream);
        });

        peer.on('error', (err) => {
            if(err.type === 'unavailable-id') {
                alert("Ya existe una cámara con este nombre/ubicación.");
                uiGoBack();
            } else {
                 statusMsg.innerText = "Error de conexión: " + err.type;
            }
        });
    })
    .catch(err => {
        alert("Error de cámara: " + err.message);
        uiGoBack();
    });
}


// --- MODO VISOR & MAPA (RECEPTOR) ---

// 1. Lógica para "Escanear" qué habitaciones están online
function checkActiveCameras() {
    mapStatusText.innerText = "📡 Escaneando cámaras disponibles...";
    
    // Usamos un Peer temporal solo para hacer "ping"
    const tempPeer = new Peer(peerConfig);

    tempPeer.on('open', () => {
        fixedRooms.forEach(roomId => {
            const fullId = APP_PREFIX + roomId;
            const conn = tempPeer.connect(fullId, { reliable: true });
            
            const uiElement = document.querySelector(`[data-room="${roomId}"]`);

            // Si la conexión de datos se abre, significa que la cámara está online
            conn.on('open', () => {
                if(uiElement) {
                    uiElement.classList.add('online');
                    uiElement.classList.remove('offline');
                }
                // Cerramos inmediatamente, solo queríamos saber si existía
                conn.close();
            });

            // Manejo básico de errores (si no conecta, asumimos offline)
            conn.on('error', () => { /* Ignorar, permanece offline */ });
            
            // Timeout de seguridad por si se queda colgado
            setTimeout(() => { if(conn.open) conn.close(); }, 2000);
        });

        // Destruir el peer temporal después de un tiempo prudencial (5s)
        setTimeout(() => {
            mapStatusText.innerText = "✅ Escaneo completado. Selecciona una cámara verde.";
            tempPeer.destroy();
        }, 5000);
    });
}

// 2. Conectar desde el Mapa (Click)
function connectToRoom(roomId) {
    const uiElement = document.querySelector(`[data-room="${roomId}"]`);
    // Permitimos intentar conectar incluso si no sale verde (por si acaso)
    // pero idealmente solo a las online.
    
    const fullId = APP_PREFIX + roomId;
    // Nombre por defecto, se actualizará si recibimos metadatos
    let display = roomId.toUpperCase();
    
    startConnection(fullId, display);
}

// 3. Conectar Manualmente
function startViewerMode() {
    const rawInput = document.getElementById('view-pet-id').value;
    const cleanName = cleanId(rawInput);
    if (!cleanName) return alert("Ingresa un nombre.");
    
    startConnection(APP_PREFIX + cleanName, cleanName.toUpperCase());
}

// 4. Lógica Core de Conexión Visor
function startConnection(targetId, initialDisplayName) {
    if(peer) peer.destroy(); // Asegurar limpieza

    // Cambiar pantalla
    viewerMap.classList.add('hidden');
    videoScreen.classList.remove('hidden');
    videoInfoText.innerText = "Buscando: " + initialDisplayName + "...";
    statusMsg.innerText = "Estableciendo conexión...";

    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        // A. Conectar Datos para obtener Nombre Real y Especie
        const conn = peer.connect(targetId);

        conn.on('open', () => { log("Datos conectados"); });
        conn.on('data', (data) => {
            if(data.type === 'info') {
                // Actualizar UI con el nombre real de la mascota
                videoInfoText.innerText = `${data.species} VIENDO A: ${data.name}`;
            }
        });

        // B. Iniciar Video
        // Truco: PeerJS a veces necesita un stream de salida para recibir bien
        const canvas = document.createElement('canvas');
        const fakeStream = canvas.captureStream(10); 

        const call = peer.call(targetId, fakeStream);

        if(!call) {
            videoInfoText.innerText = "Error al llamar.";
            return;
        }

        call.on('stream', (remoteStream) => {
            statusMsg.classList.add('hidden');
            remoteVideo.srcObject = remoteStream;
            
            // Promesa de Play para evitar bloqueo de autoplay
            const playPromise = remoteVideo.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    statusMsg.innerText = "⚠️ TOCA LA PANTALLA PARA VER VIDEO";
                    statusMsg.classList.remove('hidden');
                    document.body.addEventListener('click', () => {
                        remoteVideo.play();
                        statusMsg.classList.add('hidden');
                    }, { once: true });
                });
            }
        });

        call.on('close', () => {
            statusMsg.innerText = "Transmisión finalizada.";
            statusMsg.classList.remove('hidden');
        });
        
        call.on('error', (err) => {
            console.error(err);
            statusMsg.innerText = "Corte de señal.";
            statusMsg.classList.remove('hidden');
        });
    });

    peer.on('error', (err) => {
        console.log(err.type);
        if(err.type === 'peer-unavailable') {
            statusMsg.innerText = "❌ Cámara APAGADA o NO EXISTE.";
            statusMsg.style.color = "#e74c3c";
            statusMsg.classList.remove('hidden');
            
            // Volver al mapa automáticamente después de 3s
            setTimeout(() => {
                if(!videoScreen.classList.contains('hidden')) uiShowMap();
            }, 3000);
        } else {
            statusMsg.innerText = "Error: " + err.type;
        }
    });
}
