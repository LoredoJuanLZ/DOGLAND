// --- ELEMENTOS DEL DOM ---
const menuSection = document.getElementById('menu-selection');
const registerForm = document.getElementById('register-form');
const viewerForm = document.getElementById('viewer-form');
const videoScreen = document.getElementById('video-screen');
const remoteVideo = document.getElementById('remote-video');
const statusMsg = document.getElementById('status-msg');
const videoInfoText = document.getElementById('video-info-text'); // Nuevo elemento para mostrar info

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
// CAMBIAMOS A V7 para asegurar que carguen los cambios nuevos
const APP_PREFIX = "dogland-ios-v7-"; 

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
    videoInfoText.innerText = initialLabel;
}

function cleanId(input) {
    return input.trim().toLowerCase().replace(/\s/g, '');
}

// --- MODO CÁMARA (TRANSMISOR) ---
function startCameraMode() {
    const rawInput = document.getElementById('reg-pet-id').value;
    const cleanName = cleanId(rawInput);
    
    // Capturamos los nuevos valores
    const speciesVal = document.getElementById('reg-species').value;
    const locationVal = document.getElementById('reg-location').value;
    
    if (!cleanName) return alert("Ingresa un nombre válido.");

    const fullId = APP_PREFIX + cleanName;
    
    // Mostramos en la pantalla de la cámara dónde estamos transmitiendo
    showVideoScreen(`${cleanName} (${locationVal})`);
    log("Iniciando sistema iOS...");

    // 1. Solicitar Cámara
    navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }, 
        audio: true 
    })
    .then(stream => {
        localStream = stream;
        remoteVideo.srcObject = stream;
        remoteVideo.muted = true; 
        remoteVideo.setAttribute("playsinline", true);
        remoteVideo.play().catch(e => log("Local play error: " + e));

        log("Cámara OK. Conectando a servidor...");

        peer = new Peer(fullId, peerConfig);

        peer.on('open', (id) => {
            statusMsg.innerText = "✅ EN LÍNEA: " + cleanName;
            statusMsg.style.color = "#0f0";
            log(`Registrado: ${cleanName} en ${locationVal}`);
        });

        // 2. Manejar conexiones de DATOS (Texto)
        peer.on('connection', (conn) => {
            log("🔗 Visor conectado a datos.");
            // Apenas se conecten, les enviamos la info de ubicación y especie
            conn.on('open', () => {
                conn.send({
                    type: 'info',
                    petName: cleanName,
                    species: speciesVal,
                    location: locationVal
                });
                log("📤 Datos de ubicación enviados.");
            });
        });

        // 3. Manejar llamadas de VIDEO
        peer.on('call', (call) => {
            log("📞 Llamada entrante...");
            statusMsg.innerText = "Transmitiendo a Dueño...";
            call.answer(localStream);
            
            call.on('close', () => {
                statusMsg.innerText = "✅ EN LÍNEA (Esperando)";
                log("Visor desconectado.");
            });
        });

        peer.on('error', (err) => {
            log("ERROR: " + err.type);
            if(err.type === 'unavailable-id') {
                alert("El nombre '" + cleanName + "' ya está en uso.");
                uiGoBack();
            }
            if(err.type === 'network' || err.type === 'disconnected') {
                statusMsg.innerText = "Reconectando red...";
                peer.reconnect();
            }
        });
    })
    .catch(err => {
        alert("Error al acceder a cámara: " + err.message);
        uiGoBack();
    });
}

// --- MODO VISOR (RECEPTOR) ---
function startViewerMode() {
    const rawInput = document.getElementById('view-pet-id').value;
    const cleanName = cleanId(rawInput);

    if (!cleanName) return alert("Ingresa el nombre a buscar.");

    const targetId = APP_PREFIX + cleanName;
    showVideoScreen("Buscando: " + cleanName + "...");
    log("Buscando cámara...");

    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        log("Conectado como Visor.");
        statusMsg.innerText = "Contactando cámara...";

        // 1. Conectar canal de DATOS para recibir ubicación/especie
        const conn = peer.connect(targetId);

        conn.on('open', () => {
            log("🔗 Canal de datos abierto.");
        });

        conn.on('data', (data) => {
            if(data.type === 'info') {
                // ACTUALIZAR LA PANTALLA CON LA INFO RECIBIDA
                videoInfoText.innerHTML = `${data.petName} | ${data.species} <br><span style="font-size:0.8em; opacity:0.9">📍 ${data.location}</span>`;
                log("📥 Info recibida: " + data.location);
            }
        });

        // 2. Iniciar llamada de VIDEO
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        const fakeStream = canvas.captureStream(10);

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
        
        setTimeout(() => {
            if(statusMsg.innerText.includes("Contactando")) {
                statusMsg.innerText = "Sin respuesta. Verifica el ID.";
            }
        }, 6000);
    });

    peer.on('error', (err) => {
        if(err.type === 'peer-unavailable') {
            statusMsg.innerText = "Cámara no encontrada.";
        }
    });
}
