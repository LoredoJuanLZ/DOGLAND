// --- ELEMENTOS DEL DOM ---
const menuSection = document.getElementById('menu-selection');
const registerForm = document.getElementById('register-form');
const viewerForm = document.getElementById('viewer-form');
const videoScreen = document.getElementById('video-screen');
const remoteVideo = document.getElementById('remote-video');
const statusMsg = document.getElementById('status-msg');
const videoInfoText = document.getElementById('video-info-text');
const liveLocationSelector = document.getElementById('live-location-selector'); // El nuevo selector

// --- DEBUG EN PANTALLA ---
const debugBox = document.createElement('div');
debugBox.style.cssText = "position:fixed; bottom:0; left:0; width:100%; height:100px; background:rgba(0,0,0,0.8); color:#0f0; font-size:10px; overflow-y:scroll; z-index:9999; pointer-events:none; padding:5px; display:none;";
document.body.appendChild(debugBox);

function log(msg) {
    const time = new Date().toLocaleTimeString();
    debugBox.innerHTML = `<div>[${time}] ${msg}</div>` + debugBox.innerHTML;
}

// --- CONFIGURACIÓN ---
let peer; 
let localStream;
// Variables globales para mantener el estado actual
let currentPetName = "";
let currentSpecies = "";
let currentLocation = "";

const APP_PREFIX = "dogland-ios-v8-"; // Subimos versión

const peerConfig = {
    debug: 2,
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:stun1.l.google.com:19302' }
        ]
    }
};

// --- UI FUNCTIONS ---
function uiShowRegister() { 
    menuSection.classList.add('hidden'); 
    registerForm.classList.remove('hidden'); 
    debugBox.style.display = 'block'; 
}

function uiShowViewer() { 
    menuSection.classList.add('hidden'); 
    viewerForm.classList.remove('hidden'); 
    debugBox.style.display = 'block'; 
}

function uiGoBack() { 
    if(peer) { peer.destroy(); peer = null; }
    if(localStream) { localStream.getTracks().forEach(t => t.stop()); }
    location.reload(); 
}

function showVideoScreen(initialLabel) {
    registerForm.classList.add('hidden');
    viewerForm.classList.add('hidden');
    menuSection.classList.add('hidden');
    videoScreen.classList.remove('hidden');
    videoInfoText.innerHTML = initialLabel; // Usamos innerHTML para permitir saltos de línea
}

function cleanId(input) {
    return input.trim().toLowerCase().replace(/\s/g, '');
}

// --- MODO CÁMARA (TRANSMISOR) ---
function startCameraMode() {
    const rawInput = document.getElementById('reg-pet-id').value;
    const cleanName = cleanId(rawInput);
    
    // Guardamos datos en variables globales
    currentPetName = cleanName;
    currentSpecies = document.getElementById('reg-species').value;
    currentLocation = document.getElementById('reg-location').value;
    
    if (!cleanName) return alert("Ingresa un nombre válido.");

    const fullId = APP_PREFIX + cleanName;
    
    // 1. Configurar UI de la Cámara
    // Mostramos el selector de cambio de ubicación y ponemos el valor actual
    liveLocationSelector.classList.remove('hidden');
    liveLocationSelector.value = currentLocation;
    
    showVideoScreen(`${cleanName} (${currentSpecies}) <br> <span style="font-size:0.8em">📍 ${currentLocation}</span>`);
    log("Iniciando cámara...");

    // 2. Solicitar Hardware
    navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }, 
        audio: true 
    })
    .then(stream => {
        localStream = stream;
        remoteVideo.srcObject = stream;
        remoteVideo.muted = true; // Mute local para evitar eco
        remoteVideo.setAttribute("playsinline", true);
        remoteVideo.play().catch(e => log("Local play error: " + e));

        log("Cámara OK. Conectando a servidor...");

        peer = new Peer(fullId, peerConfig);

        peer.on('open', (id) => {
            statusMsg.innerText = "✅ TRANSMITIENDO: " + cleanName;
            statusMsg.style.color = "#0f0";
            log(`Registrado: ${cleanName}`);
        });

        // Manejo de Conexiones de Datos (Para enviar info)
        peer.on('connection', (conn) => {
            log("🔗 Visor conectado a datos.");
            conn.on('open', () => {
                // Enviar info actual apenas se conecten
                sendInfo(conn);
            });
            conn.on('error', (err) => {
                 log("Error canal de datos (Cámara): " + err);
            });
        });

        // Manejo de llamadas de Video
        peer.on('call', (call) => {
            log("📞 Enviando video...");
            call.answer(localStream);
        });

        peer.on('error', (err) => {
            log("ERROR PEER CÁMARA: " + err.type + " - " + err.message);
            if(err.type === 'unavailable-id') {
                alert("El nombre '" + cleanName + "' ya está en uso.");
                uiGoBack();
            } else {
                 statusMsg.innerText = "Error crítico de conexión.";
            }
        });
    })
    .catch(err => {
        alert("Error al acceder a cámara: " + err.message);
        uiGoBack();
    });
}

// --- FUNCIÓN: ACTUALIZAR UBICACIÓN EN VIVO ---
function updateLiveLocation() {
    // 1. Obtener el nuevo valor del selector
    const newLoc = liveLocationSelector.value;
    currentLocation = newLoc; // Actualizar variable global

    // 2. Actualizar mi propia pantalla
    videoInfoText.innerHTML = `${currentPetName} (${currentSpecies}) <br> <span style="font-size:0.8em">📍 ${currentLocation}</span>`;
    log("Cambio de ubicación: " + currentLocation);

    // 3. Enviar la nueva info a TODOS los conectados
    if (peer && peer.connections) {
        // peer.connections es un objeto donde las claves son los IDs de los conectados
        Object.values(peer.connections).forEach(connections => {
            connections.forEach(conn => {
                if (conn.open) {
                    sendInfo(conn);
                }
            });
        });
    }
}

// Función auxiliar para enviar el objeto de datos
function sendInfo(conn) {
    conn.send({
        type: 'info',
        petName: currentPetName,
        species: currentSpecies,
        location: currentLocation
    });
}


// --- MODO VISOR (RECEPTOR) ---
function startViewerMode() {
    const rawInput = document.getElementById('view-pet-id').value;
    const cleanName = cleanId(rawInput);

    if (!cleanName) return alert("Ingresa el nombre a buscar.");

    const targetId = APP_PREFIX + cleanName;
    
    // Aseguramos que el selector esté OCULTO para el dueño
    liveLocationSelector.classList.add('hidden');
    
    showVideoScreen("Buscando: " + cleanName + "...");
    log("Buscando cámara...");

    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        log("Conectado como Visor con ID: " + id); // Log más detallado
        statusMsg.innerText = "Contactando cámara...";

        // 1. Conectar canal de DATOS
        const conn = peer.connect(targetId);

        conn.on('open', () => {
            log("🔗 Canal de datos abierto.");
        });

        // AQUÍ RECIBIMOS LAS ACTUALIZACIONES DE UBICACIÓN
        conn.on('data', (data) => {
            if(data.type === 'info') {
                // Ajuste de tamaño de fuente para mejor visibilidad
                videoInfoText.innerHTML = `${data.petName} (${data.species}) <br><span style="font-size:0.9em; opacity:0.9; color: #FFCCBC;">📍 ${data.location}</span>`; 
                log("📥 Ubicación actualizada: " + data.location);
            }
        });
        
        conn.on('error', (err) => {
            log("Error canal de datos (Visor): " + err);
        });
        
        conn.on('close', () => {
            log("Canal de datos cerrado.");
        });


        // 2. Iniciar llamada de VIDEO
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        const fakeStream = canvas.captureStream(10); // Truco para que iOS active audio

        const call = peer.call(targetId, fakeStream);

        if(!call) {
            log("Error: No se pudo llamar.");
            return;
        }

        call.on('stream', (remoteStream) => {
            log("✅ VIDEO RECIBIDO");
            statusMsg.classList.add('hidden');
            
            remoteVideo.srcObject = remoteStream;
            remoteVideo.setAttribute("playsinline", true);
            
            const playPromise = remoteVideo.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    statusMsg.innerText = "TOCA LA PANTALLA PARA VER";
                    statusMsg.classList.remove('hidden');
                    document.body.addEventListener('click', () => {
                        remoteVideo.play();
                        statusMsg.classList.add('hidden');
                    }, { once: true });
                });
            }
        });

        call.on('error', (err) => {
            log("Error llamada: " + err);
            statusMsg.innerText = "Corte de transmisión.";
        });
        
        call.on('close', () => {
            log("Llamada cerrada.");
            statusMsg.innerText = "Transmisión finalizada o perdida.";
            statusMsg.classList.remove('hidden');
        });
    });

    // --- CORRECCIÓN CLAVE: MANEJO DE ERROR DEL PEER PRINCIPAL ---
    peer.on('error', (err) => {
        log("ERROR PEER VISOR: " + err.type + " - " + err.message);
        // El error que mencionas ('Could not connect to peer') se reporta aquí como 'peer-unavailable'
        if(err.type === 'peer-unavailable' || err.type === 'network') {
            statusMsg.innerText = "Cámara no encontrada. Asegúrate que el ID sea correcto y esté transmitiendo.";
        } else {
             statusMsg.innerText = "Error de conexión: " + err.type;
        }
    });
}
