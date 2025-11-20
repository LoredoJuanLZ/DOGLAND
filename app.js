// ELEMENTOS DEL DOM
const menuSection = document.getElementById('menu-selection');
const registerForm = document.getElementById('register-form');
const viewerForm = document.getElementById('viewer-form');
const videoScreen = document.getElementById('video-screen');
const remoteVideo = document.getElementById('remote-video');
const statusMsg = document.getElementById('status-msg');
const petNameLabel = document.getElementById('video-pet-name');

let peer; 
let localStream;

const APP_PREFIX = "dogland-final-v4-"; 

const peerConfig = {
    debug: 2,
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:stun1.l.google.com:19302' }
        ]
    }
};

/* --- TRUCO TÉCNICO: STREAM FANTASMA --- */
// Crea un video "negro" y silencioso para engañar a PeerJS
function createEmptyStream() {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const stream = canvas.captureStream();
    // Añadir pista de audio muda para compatibilidad total
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const dst = audioCtx.createMediaStreamDestination();
    oscillator.connect(dst);
    const audioTrack = dst.stream.getAudioTracks()[0];
    stream.addTrack(audioTrack);
    return stream;
}

/* --- UI --- */
function uiShowRegister() { menuSection.classList.add('hidden'); registerForm.classList.remove('hidden'); }
function uiShowViewer() { menuSection.classList.add('hidden'); viewerForm.classList.remove('hidden'); }
function uiGoBack() { 
    if(peer) { peer.destroy(); peer = null; }
    location.reload(); 
}

function showVideoScreen(label) {
    registerForm.classList.add('hidden');
    viewerForm.classList.add('hidden');
    menuSection.classList.add('hidden');
    videoScreen.classList.remove('hidden');
    petNameLabel.innerText = label;
}

/* --- MODO CÁMARA (TRANSMISOR) --- */
function startCameraMode() {
    const petIdInput = document.getElementById('reg-pet-id').value.trim();
    if (!petIdInput) return alert("Ingresa un ID.");

    const fullId = APP_PREFIX + petIdInput.toLowerCase();

    showVideoScreen("Cámara: " + petIdInput);
    statusMsg.innerText = "Iniciando cámara...";

    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true })
        .then(stream => {
            localStream = stream;
            remoteVideo.srcObject = stream;
            remoteVideo.muted = true; 
            remoteVideo.play();

            statusMsg.innerText = "Conectando a la nube...";
            peer = new Peer(fullId, peerConfig);

            peer.on('open', (id) => {
                statusMsg.innerText = "✅ CÁMARA LISTA. ID: " + petIdInput;
                console.log('ID: ' + id);
            });

            // Esperar conexión de datos del dueño
            peer.on('connection', (conn) => {
                console.log("Dueño contactando...");
                conn.on('open', () => {
                    statusMsg.innerText = "Enviando video...";
                    // La cámara llama al dueño con el video real
                    peer.call(conn.peer, localStream);
                });
            });

            peer.on('error', (err) => {
                console.error(err);
                if(err.type === 'unavailable-id') alert("ID en uso.");
            });
        })
        .catch(err => {
            alert("Error cámara: " + err.message);
            uiGoBack();
        });
}

/* --- MODO VISOR (RECEPTOR) --- */
function startViewerMode() {
    const petIdInput = document.getElementById('view-pet-id').value.trim();
    if (!petIdInput) return alert("Ingresa el ID.");

    const targetId = APP_PREFIX + petIdInput.toLowerCase();

    showVideoScreen("Viendo a: " + petIdInput);
    statusMsg.innerText = "Conectando...";

    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        console.log("Soy visor: " + id);
        statusMsg.innerText = "Solicitando permiso...";

        // 1. Tocar la puerta (Conexión de datos)
        const conn = peer.connect(targetId);

        conn.on('open', () => {
            statusMsg.innerText = "Esperando video...";
        });
        
        // Si tarda más de 5 segundos, avisar
        setTimeout(() => {
            if(statusMsg.innerText === "Esperando video...") {
                statusMsg.innerText = "La cámara no responde. ¿Está encendida?";
            }
        }, 8000);
    });

    // 2. Recibir la llamada de la cámara
    peer.on('call', (call) => {
        console.log("Recibiendo llamada de video...");
        statusMsg.classList.add('hidden');

        // AQUÍ ESTÁ LA SOLUCIÓN:
        // Contestamos con un "Stream Fantasma" para que PeerJS no se queje
        const fakeStream = createEmptyStream();
        call.answer(fakeStream); 

        call.on('stream', (remoteStream) => {
            remoteVideo.srcObject = remoteStream;
            remoteVideo.play().catch(e => console.log("Click para reproducir"));
        });

        call.on('close', () => {
            alert("Cámara desconectada");
            uiGoBack();
        });
    });

    peer.on('error', (err) => {
        console.log(err);
        statusMsg.innerText = "Error: " + err.type;
    });
}
