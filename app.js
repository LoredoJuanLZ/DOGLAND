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

// CONFIGURACIÓN IMPORTANTE
// Usamos un prefijo para evitar chocar con otros usuarios de PeerJS
const APP_PREFIX = "dogland-app-v2-"; 

// Configuración de servidores STUN (ayudan a atravesar el router)
const peerConfig = {
    debug: 2, // Muestra errores en la consola
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
    registerForm.classList.add('hidden'); 
    viewerForm.classList.add('hidden'); 
    menuSection.classList.remove('hidden'); 
    
    // Si había una conexión previa, la cerramos limpiamente
    if(peer) { peer.destroy(); peer = null; }
    if(localStream) { 
        localStream.getTracks().forEach(track => track.stop()); 
        localStream = null; 
    }
    location.reload(); // Recargar para limpiar memoria
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

    const fullId = APP_PREFIX + petIdInput.toLowerCase(); // ID único

    showVideoScreen("Cámara: " + petIdInput);
    statusMsg.innerText = "Iniciando cámara...";

    // 1. Acceder a la cámara
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: true })
        .then(stream => {
            localStream = stream;
            remoteVideo.srcObject = stream;
            remoteVideo.muted = true; // Mute local
            remoteVideo.play(); // Asegurar reproducción local

            statusMsg.innerText = "Conectando al servidor...";

            // 2. Crear conexión Peer con el ID específico
            peer = new Peer(fullId, peerConfig);

            peer.on('open', (id) => {
                statusMsg.innerText = "✅ EN LÍNEA. ID: " + petIdInput;
                console.log('Cámara lista con ID: ' + id);
            });

            // 3. Contestador Automático
            peer.on('call', (call) => {
                console.log("¡Alguien está llamando!");
                statusMsg.innerText = "Conectando con dueño...";
                
                // Respondemos con nuestro video
                call.answer(localStream); 
                
                // Monitorear si se cierra
                call.on('close', () => {
                    statusMsg.innerText = "✅ EN LÍNEA. Esperando...";
                });
            });

            peer.on('error', (err) => {
                console.error(err);
                if(err.type === 'unavailable-id') {
                    alert("El ID '" + petIdInput + "' ya está en uso. Elige otro.");
                    uiGoBack();
                } else {
                    statusMsg.innerText = "Error: " + err.type;
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
    statusMsg.innerText = "Buscando señal...";

    // Crear Peer como visor (sin ID específico)
    peer = new Peer(peerConfig);

    peer.on('open', (id) => {
        console.log("Soy el visor " + id);
        statusMsg.innerText = "Llamando a la cámara...";
        
        // Iniciamos la llamada
        // Importante: Enviamos null porque el visor no transmite video
        const call = peer.call(targetId, null); 

        if (!call) {
            statusMsg.innerText = "No se pudo iniciar la llamada.";
            return;
        }

        // Manejar la respuesta
        call.on('stream', (remoteStream) => {
            console.log("¡Video recibido!");
            statusMsg.classList.add('hidden');
            
            remoteVideo.srcObject = remoteStream;
            
            // INTENTO FORZADO DE REPRODUCCIÓN (Solución a pantalla negra)
            remoteVideo.play().catch(error => {
                console.log("Autoplay bloqueado, intentando mute...", error);
                remoteVideo.muted = true; // Si falla, muteamos y probamos de nuevo
                remoteVideo.play();
            });
        });

        call.on('error', (err) => {
            console.error("Error en llamada:", err);
            statusMsg.innerText = "Error en transmisión.";
        });
        
        call.on('close', () => {
            statusMsg.innerText = "La cámara se desconectó.";
            statusMsg.classList.remove('hidden');
        });

        // Esperar 5 segundos, si no conecta, avisar
        setTimeout(() => {
            if(remoteVideo.paused && !remoteVideo.srcObject) {
                statusMsg.innerText = "No responde. Verifica que la cámara esté encendida y el ID sea correcto.";
            }
        }, 5000);
    });

    peer.on('error', (err) => {
        console.error(err);
        statusMsg.innerText = "Error de conexión: " + err.type;
    });
}
