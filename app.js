// --- ELEMENTOS DEL DOM ---
const menuSection = document.getElementById('menu-selection');
const registerForm = document.getElementById('register-form');
const viewerForm = document.getElementById('viewer-form');
const videoScreen = document.getElementById('video-screen');
const remoteVideo = document.getElementById('remote-video');
const statusMsg = document.getElementById('status-msg');
const petNameLabel = document.getElementById('video-pet-name');

// --- SISTEMA DE LOGS EN PANTALLA (NUEVO) ---
// Creamos un div para ver errores en el celular
const debugBox = document.createElement('div');
debugBox.style.cssText = "position:fixed; bottom:0; left:0; width:100%; height:150px; background:rgba(0,0,0,0.8); color:#0f0; font-size:10px; overflow-y:scroll; z-index:9999; pointer-events:none; padding:10px; display:none;";
document.body.appendChild(debugBox);

function log(msg) {
    const time = new Date().toLocaleTimeString();
    console.log(`[${time}] ${msg}`);
    debugBox.innerHTML += `<div>[${time}] ${msg}</div>`;
    debugBox.scrollTop = debugBox.scrollHeight; // Auto scroll
}

// --- CONFIGURACIÓN ---
let peer; 
let localStream;
const APP_PREFIX = "dogland-final-v5-"; 

const peerConfig = {
    debug: 2,
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:stun1.l.google.com:19302' },
            { url: 'stun:stun2.l.google.com:19302' }
        ]
    }
};

// --- GENERADOR DE STREAM FANTASMA (Vital para el Dueño) ---
function createEmptyStream() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1;
    canvas.height = 1;
    ctx.fillStyle = "black";
    ctx.fillRect(0,0,1,1);
    
    const stream = canvas.captureStream(15); // 15 FPS
    
    // Audio mudo
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const dst = audioCtx.createMediaStreamDestination();
    const track = dst.stream.getAudioTracks()[0];
    stream.addTrack(track);
    
    return stream;
}

// --- UI ---
function uiShowRegister() { 
    menuSection.classList.add('hidden'); 
    registerForm.classList.remove('hidden'); 
    debugBox.style.display = 'block'; // Mostrar logs
}
function uiShowViewer() { 
    menuSection.classList.add('hidden'); 
    viewerForm.classList.remove('hidden'); 
    debugBox.style.display = 'block'; // Mostrar logs
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

// --- MODO CÁMARA (Recibe la llamada) ---
function startCameraMode() {
    const petIdInput = document.getElementById('reg-pet-id').value.trim();
    if (!petIdInput) return alert("Ingresa un ID.");

    const fullId = APP_PREFIX + petIdInput.toLowerCase();
    showVideoScreen("Cámara: " + petIdInput);
    log("Iniciando modo cámara...");

    // 1. Encender Cámara
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true })
        .then(stream => {
            localStream = stream;
            remoteVideo.srcObject = stream;
            remoteVideo.muted = true; 
            remoteVideo.play();
            log("Cámara obtenida. Conectando a nube...");

            // 2. Conectar a PeerJS
            peer = new Peer(fullId, peerConfig);

            peer.on('open', (id) => {
                statusMsg.innerText = "✅ CÁMARA LISTA. ID: " + petIdInput;
                log("ID registrado: " + id);
                log("Esperando llamada del dueño...");
            });

            // 3. CONTESTAR LLAMADA
            peer.on('call', (call) => {
                log("📞 ¡Llamada entrante!");
                statusMsg.innerText = "Conectando con dueño...";
                
                // Respondemos enviando NUESTRA cámara
                call.answer(localStream);
                
                call.on('stream', () => { log("Conexión establecida (stream phantom recibido)"); });
                call.on('close', () => { 
                    log("Llamada finalizada"); 
                    statusMsg.innerText = "✅ CÁMARA LISTA. Esperando...";
                });
                call.on('error', (e) => log("Error en llamada: " + e));
            });

            peer.on('error', (err) => {
                log("ERROR CRÍTICO: " + err.type);
                if(err.type === 'unavailable-id') alert("El ID ya está ocupado.");
            });

            peer.on('disconnected', () => {
                log("Desconectado de la nube. Reconectando...");
                peer.reconnect();
            });
        })
        .catch(err => {
            alert("No se pudo acceder a la cámara: " + err.message);
            log("Error getUserMedia: " + err);
        });
}

// --- MODO VISOR (Realiza la llamada) ---
function startViewerMode() {
    const petIdInput = document.getElementById('view-pet-id').value.trim();
    if (!petIdInput) return alert("Ingresa el ID.");

    const targetId = APP_PREFIX + petIdInput.toLowerCase();
    showVideoScreen("Viendo a: " + petIdInput);
    log("Iniciando modo visor...");

    // 1. Conectar a PeerJS
    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        log("Conectado a nube con ID temporal: " + id);
        statusMsg.innerText = "Llamando a la cámara...";
        
        // 2. Generar Stream Fantasma (PARA EVITAR EL ERROR ANTERIOR)
        const fakeStream = createEmptyStream();
        log("Stream fantasma generado.");

        // 3. Llamar a la cámara enviando el fantasma
        log("Intentando llamar a: " + targetId);
        const call = peer.call(targetId, fakeStream);

        if(!call) {
            log("Error: No se pudo crear la llamada (¿PeerJS falló?)");
            return;
        }

        // 4. Recibir el video real
        call.on('stream', (cameraStream) => {
            log("✅ ¡VIDEO RECIBIDO!");
            statusMsg.classList.add('hidden');
            remoteVideo.srcObject = cameraStream;
            
            // Asegurar reproducción
            const playPromise = remoteVideo.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    log("Autoplay bloqueado: " + error);
                    statusMsg.innerText = "Toca la pantalla para ver video";
                    // Agregar botón manual si falla
                    const btn = document.createElement('button');
                    btn.innerText = "▶ REPRODUCIR VIDEO";
                    btn.style.cssText = "position:absolute; z-index:10000; padding:20px; font-size:20px;";
                    btn.onclick = () => { remoteVideo.play(); btn.remove(); };
                    videoScreen.appendChild(btn);
                });
            }
        });

        call.on('close', () => {
            alert("Transmisión terminada");
            uiGoBack();
        });

        call.on('error', (e) => log("Error en llamada: " + e));

        // Timeout de seguridad
        setTimeout(() => {
            if(remoteVideo.paused && !remoteVideo.srcObject) {
                log("ALERTA: Han pasado 8s y no hay video.");
                statusMsg.innerText = "Sin respuesta. Verifica el ID en la cámara.";
            }
        }, 8000);
    });

    peer.on('error', (err) => {
        log("ERROR PEER: " + err.type);
        if(err.type === 'peer-unavailable') {
            statusMsg.innerText = "No encuentro la cámara. ¿Está el ID bien escrito?";
        }
    });
}
