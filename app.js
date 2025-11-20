// Elementos del DOM
const menuSection = document.getElementById('menu-selection');
const registerForm = document.getElementById('register-form');
const viewerForm = document.getElementById('viewer-form');
const videoScreen = document.getElementById('video-screen');
const remoteVideo = document.getElementById('remote-video');
const statusMsg = document.getElementById('status-msg');
const petNameLabel = document.getElementById('video-pet-name');

let peer; // El objeto de conexión
let currentCall;
let localStream;

// Prefijo para evitar colisiones con otros usuarios de PeerJS en el mundo
const APP_PREFIX = "dogland-v1-"; 

/* --- FUNCIONES DE INTERFAZ (UI) --- */
function uiShowRegister() { menuSection.classList.add('hidden'); registerForm.classList.remove('hidden'); }
function uiShowViewer() { menuSection.classList.add('hidden'); viewerForm.classList.remove('hidden'); }
function uiGoBack() { 
    registerForm.classList.add('hidden'); 
    viewerForm.classList.add('hidden'); 
    menuSection.classList.remove('hidden'); 
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
    if (!petIdInput) return alert("Ingresa un ID para la mascota.");

    // Generamos un ID completo (ej: dogland-v1-firulais)
    const fullId = APP_PREFIX + petIdInput.toLowerCase();

    showVideoScreen("Cámara: " + petIdInput);
    statusMsg.innerText = "Accediendo a cámara...";

    // 1. Obtener Video y Audio
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true })
        .then(stream => {
            localStream = stream;
            remoteVideo.srcObject = stream; // Vernos a nosotros mismos
            remoteVideo.muted = true; // Silenciar local para no oír eco

            statusMsg.innerText = "Conectando a la nube...";

            // 2. Crear Peer con el ID específico
            peer = new Peer(fullId);

            peer.on('open', (id) => {
                statusMsg.innerText = "✅ En línea. Esperando conexión en ID: " + petIdInput;
                console.log('Mi ID de peer es: ' + id);
            });

            peer.on('error', (err) => {
                console.error(err);
                if(err.type === 'unavailable-id') {
                    alert("Ese ID ya está en uso. Prueba otro nombre.");
                    location.reload();
                } else {
                    statusMsg.innerText = "Error de conexión: " + err.type;
                }
            });

            // 3. Responder llamadas entrantes
            peer.on('call', (call) => {
                console.log("Recibiendo llamada de un dueño...");
                // Respondemos enviando nuestro stream de video
                call.answer(localStream); 
                
                statusMsg.classList.add('hidden'); // Ocultar texto al conectar
            });

        })
        .catch(err => {
            alert("Error cámara: " + err);
            location.reload();
        });
}

/* --- MODO VISOR (RECEPTOR) --- */
function startViewerMode() {
    const petIdInput = document.getElementById('view-pet-id').value.trim();
    if (!petIdInput) return alert("Ingresa el ID a buscar.");

    const targetId = APP_PREFIX + petIdInput.toLowerCase();

    showVideoScreen("Viendo a: " + petIdInput);
    statusMsg.innerText = "Conectando con la cámara...";

    // Crear Peer (sin ID específico, el sistema nos da uno al azar)
    peer = new Peer();

    peer.on('open', (id) => {
        console.log("Soy el visor con ID: " + id);
        // Iniciamos la llamada a la cámara
        const call = peer.call(targetId, null); // null porque el visor no envía video, solo recibe

        handleCall(call);
    });

    peer.on('error', (err) => {
        statusMsg.innerText = "No se encontró la cámara '" + petIdInput + "'. Verifica el nombre.";
    });
}

function handleCall(call) {
    call.on('stream', (remoteStream) => {
        statusMsg.classList.add('hidden');
        remoteVideo.srcObject = remoteStream;
        remoteVideo.muted = false; // Activar audio remoto
    });

    call.on('close', () => {
        alert("La transmisión ha terminado.");
        location.reload();
    });
}