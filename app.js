// ELEMENTOS DEL DOM
const menuSection = document.getElementById('menu-selection');
const registerForm = document.getElementById('register-form');
const viewerForm = document.getElementById('viewer-form');
const videoScreen = document.getElementById('video-screen');
const remoteVideo = document.getElementById('remote-video');
const statusMsg = document.getElementById('status-msg');
const petNameLabel = document.getElementById('video-pet-name');

let peer; // Objeto de conexión
let localStream; // Tu video (si eres cámara)

// Prefijo para evitar que se mezclen con otros usuarios de la librería
const APP_PREFIX = "dogland-v3-"; 

// Configuración de servidores para atravesar routers
const peerConfig = {
    debug: 2,
    config: {
        'iceServers': [
            { url: 'stun:stun.l.google.com:19302' },
            { url: 'stun:stun1.l.google.com:19302' }
        ]
    }
};

/* --- FUNCIONES DE INTERFAZ (UI) --- */
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

    // 1. Obtener cámara
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true })
        .then(stream => {
            localStream = stream;
            remoteVideo.srcObject = stream;
            remoteVideo.muted = true; // Mute local
            remoteVideo.play();

            statusMsg.innerText = "Conectando a la red...";

            // 2. Crear ID en la nube
            peer = new Peer(fullId, peerConfig);

            peer.on('open', (id) => {
                statusMsg.innerText = "✅ LÍNEA. ID: " + petIdInput;
                console.log('Cámara lista: ' + id);
            });

            // 3. ESPERAR SEÑAL DEL DUEÑO (Data Connection)
            peer.on('connection', (conn) => {
                console.log("Dueño conectado...");
                
                conn.on('open', () => {
                    statusMsg.innerText = "Enviando video al dueño...";
                    // AQUI ESTA EL TRUCO: La cámara llama al dueño
                    const call = peer.call(conn.peer, localStream);
                    
                    call.on('close', () => {
                        statusMsg.innerText = "✅ LÍNEA. Esperando...";
                    });
                });
            });

            peer.on('error', (err) => {
                console.error(err);
                if(err.type === 'unavailable-id') {
                    alert("El ID ya está en uso.");
                    uiGoBack();
                }
            });
        })
        .catch(err => {
            alert("Error de cámara: " + err.message);
            uiGoBack();
        });
}

/* --- MODO VISOR (RECEPTOR) --- */
function startViewerMode() {
    const petIdInput = document.getElementById('view-pet-id').value.trim();
    if (!petIdInput) return alert("Ingresa el ID a buscar.");

    const targetId = APP_PREFIX + petIdInput.toLowerCase();

    showVideoScreen("Viendo a: " + petIdInput);
    statusMsg.innerText = "Conectando...";

    // Crear Peer como visor (ID aleatorio)
    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        console.log("Soy el visor " + id);
        statusMsg.innerText = "Solicitando video...";

        // 1. Conectamos por DATOS primero (Chat)
        const conn = peer.connect(targetId);

        conn.on('open', () => {
            console.log("Conectado a la cámara. Esperando video...");
            statusMsg.innerText = "Esperando transmisión...";
        });

        conn.on('error', (err) => {
            statusMsg.innerText = "No se encuentra la cámara.";
        });
    });

    // 2. ESPERAR LA LLAMADA DE VUELTA DE LA CÁMARA
    peer.on('call', (call) => {
        console.log("Recibiendo video...");
        statusMsg.classList.add('hidden');

        // Contestamos sin enviar video (null es válido al contestar)
        call.answer(null); 

        call.on('stream', (remoteStream) => {
            remoteVideo.srcObject = remoteStream;
            remoteVideo.play().catch(e => console.log("Autoplay error", e));
        });

        call.on('close', () => {
            alert("Transmisión finalizada");
            uiGoBack();
        });
    });

    peer.on('error', (err) => {
        console.log(err);
        statusMsg.innerText = "Error: " + err.type;
    });
}
