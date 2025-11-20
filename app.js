// --- ELEMENTOS DEL DOM ---
const menuSection = document.getElementById('menu-selection');
const registerForm = document.getElementById('register-form');
const viewerForm = document.getElementById('viewer-form');
const videoScreen = document.getElementById('video-screen');
const remoteVideo = document.getElementById('remote-video');
const statusMsg = document.getElementById('status-msg');
const petNameLabel = document.getElementById('video-pet-name');

// --- DEBUG EN PANTALLA (Útil para ver errores en el iPhone) ---
const debugBox = document.createElement('div');
debugBox.style.cssText = "position:fixed; bottom:0; left:0; width:100%; height:100px; background:rgba(0,0,0,0.8); color:#0f0; font-size:10px; overflow-y:scroll; z-index:9999; pointer-events:none; padding:5px; display:none;";
document.body.appendChild(debugBox);

function log(msg) {
    const time = new Date().toLocaleTimeString();
    // console.log(`[${time}] ${msg}`); // Descomentar si quieres ver en consola PC
    debugBox.innerHTML = `<div>[${time}] ${msg}</div>` + debugBox.innerHTML;
}

// --- CONFIGURACIÓN ---
let peer; 
let localStream;
// CAMBIAMOS A V6 para evitar caché viejo
const APP_PREFIX = "dogland-ios-v6-"; 

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

function showVideoScreen(label) {
    registerForm.classList.add('hidden');
    viewerForm.classList.add('hidden');
    menuSection.classList.add('hidden');
    videoScreen.classList.remove('hidden');
    petNameLabel.innerText = label;
}

// --- FUNCION PARA LIMPIAR ID (Clave para iPhone) ---
function cleanId(input) {
    // Quita espacios y fuerza minúsculas
    return input.trim().toLowerCase().replace(/\s/g, '');
}

// --- MODO CÁMARA (El iPhone transmitiendo) ---
function startCameraMode() {
    const rawInput = document.getElementById('reg-pet-id').value;
    const cleanName = cleanId(rawInput);
    
    if (!cleanName) return alert("Ingresa un nombre válido.");

    const fullId = APP_PREFIX + cleanName;
    showVideoScreen("Cámara: " + cleanName);
    log("Iniciando sistema iOS...");

    // 1. Solicitar Cámara (Debe ser inmediato al click en iOS)
    navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } }, 
        audio: true 
    })
    .then(stream => {
        localStream = stream;
        
        // Fix iOS: Video local mudo y playsinline
        remoteVideo.srcObject = stream;
        remoteVideo.muted = true; 
        remoteVideo.setAttribute("playsinline", true); // Doble seguridad
        remoteVideo.play().catch(e => log("Local play error: " + e));

        log("Cámara OK. Conectando a servidor...");

        // 2. Iniciar Peer
        peer = new Peer(fullId, peerConfig);

        peer.on('open', (id) => {
            statusMsg.innerText = "✅ EN LÍNEA: " + cleanName;
            statusMsg.style.color = "#0f0";
            log("ID REGISTRADO: " + cleanName);
            log("No apagues la pantalla.");
        });

        // 3. Contestar llamadas
        peer.on('call', (call) => {
            log("📞 Conectando con visor...");
            statusMsg.innerText = "Transmitiendo...";
            call.answer(localStream);
            
            call.on('close', () => {
                statusMsg.innerText = "✅ EN LÍNEA (Esperando)";
                log("Visor desconectado.");
            });
            
            call.on('error', (e) => log("Error llamada: " + e));
        });

        peer.on('error', (err) => {
            log("ERROR: " + err.type);
            if(err.type === 'unavailable-id') {
                alert("El nombre '" + cleanName + "' ya está en uso. Usa otro.");
                uiGoBack();
            }
            if(err.type === 'network' || err.type === 'disconnected') {
                statusMsg.innerText = "Reconectando red...";
                peer.reconnect();
            }
        });

        // Fix iOS: Reconexión si se minimiza
        peer.on('disconnected', () => {
            log("Desconectado. Intentando reconectar...");
            peer.reconnect();
        });

    })
    .catch(err => {
        alert("Error al acceder a cámara: " + err.message);
        log("Camera Error: " + err);
        uiGoBack();
    });
}

// --- MODO VISOR (Viendo desde Windows/Android) ---
function startViewerMode() {
    const rawInput = document.getElementById('view-pet-id').value;
    const cleanName = cleanId(rawInput);

    if (!cleanName) return alert("Ingresa el nombre a buscar.");

    const targetId = APP_PREFIX + cleanName;
    showVideoScreen("Buscando: " + cleanName);
    log("Buscando cámara...");

    // Visor con ID aleatorio
    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        log("Conectado como Visor.");
        statusMsg.innerText = "Llamando a " + cleanName + "...";

        // Crear Stream vacío para engañar al navegador (Truco iOS)
        const canvas = document.createElement('canvas');
        canvas.width = 1; canvas.height = 1;
        const fakeStream = canvas.captureStream(10);

        // Llamamos a la cámara
        const call = peer.call(targetId, fakeStream);

        if(!call) {
            log("Error crítico: No se pudo iniciar llamada.");
            return;
        }

        call.on('stream', (remoteStream) => {
            log("✅ ¡SEÑAL RECIBIDA!");
            statusMsg.classList.add('hidden');
            
            remoteVideo.srcObject = remoteStream;
            remoteVideo.setAttribute("playsinline", true);
            
            // Promesa de reproducción segura
            const playPromise = remoteVideo.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    log("Autoplay bloqueado. Toca la pantalla.");
                    statusMsg.innerText = "TOCA LA PANTALLA PARA VER";
                    statusMsg.classList.remove('hidden');
                    
                    // Botón de emergencia
                    document.body.addEventListener('click', () => {
                        remoteVideo.play();
                        statusMsg.classList.add('hidden');
                    }, { once: true });
                });
            }
        });

        call.on('error', (err) => {
            log("Error en llamada: " + err);
            statusMsg.innerText = "Corte de transmisión.";
        });
        
        // Timeout manual por si PeerJS no responde el error
        setTimeout(() => {
            if(statusMsg.innerText.includes("Llamando")) {
                statusMsg.innerText = "No responde. Verifica que el iPhone tenga la pantalla encendida.";
            }
        }, 6000);
    });

    peer.on('error', (err) => {
        log("Error Peer: " + err.type);
        if(err.type === 'peer-unavailable') {
            statusMsg.innerText = "Cámara no encontrada. Revisa el nombre.";
        }
    });
}
