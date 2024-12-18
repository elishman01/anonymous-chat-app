// DOM Elements
const chatContainer = document.getElementById('chat-container');
const welcomeContainer = document.getElementById('welcome-container');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const userCountElement = document.getElementById('user-count');
const copyUrlButton = document.getElementById('copy-url');

// Generate a random user ID
const userId = Math.random().toString(36).substring(2, 15);

// Function to add messages
function addMessage(userId, message, mediaUrl = null, mediaType = null, isSystem = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = isSystem ? 'message system-message' : 
                          `message ${userId === 'You' ? 'own-message' : 'other-message'}`;
    
    let content = `<strong>${userId}:</strong><p>${message}</p>`;
    
    if (mediaUrl) {
        if (mediaType === 'image') {
            content += `<img src="${mediaUrl}" alt="Shared image" class="shared-media">`;
        } else if (mediaType === 'video') {
            content += `<video src="${mediaUrl}" controls class="shared-media"></video>`;
        }
    }
    
    messageDiv.innerHTML = content;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Connect to Socket.IO server
const BACKEND_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://anonymous-chat-backend-8m4i.onrender.com';

const socket = io(BACKEND_URL, {
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
});

// Handle connection events
socket.on('connect', () => {
    console.log('Connected to server');
    // If we have a room ID in the URL, join that room
    const roomId = window.location.pathname.split('/').pop();
    if (roomId && roomId.length > 0) {
        console.log('Attempting to join room:', roomId);
        socket.emit('join-room', roomId);
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    addMessage('System', 'Disconnected from server. Trying to reconnect...', null, null, true);
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    addMessage('System', 'Connection error. Please check your internet connection.', null, null, true);
});

// Handle room events
socket.on('room-created', (data) => {
    console.log('Room created:', data);
    window.history.pushState({}, '', `/${data.roomId}`);
    document.getElementById('welcome-container').style.display = 'none';
    document.getElementById('chat-container').classList.remove('hidden');
});

socket.on('room-joined', (data) => {
    console.log('Room joined successfully:', data);
    document.getElementById('welcome-container').style.display = 'none';
    document.getElementById('chat-container').classList.remove('hidden');
});

socket.on('error', (data) => {
    console.error('Server error:', data);
    addMessage('System', data.message, null, null, true);
});

// Handle messages
socket.on('message', (data) => {
    console.log('Received message:', data);
    if (data.userId === 'System') {
        addMessage(data.userId, data.message, null, null, true);
    } else {
        addMessage(data.userId, data.message, data.mediaUrl, data.mediaType);
    }
});

// Function to create a room
function createRoom() {
    socket.emit('create-room');
}

// Function to send a message
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        socket.emit('message', { message });
        messageInput.value = '';
    }
}

// Handle file uploads
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        addMessage('System', 'Uploading file...', null, null, true);
        
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${BACKEND_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`Upload failed: ${response.statusText}`);
        }

        const result = await response.json();
        console.log('Upload result:', result);

        if (result.url) {
            const mediaType = file.type.startsWith('image/') ? 'image' : 'video';
            socket.emit('message', {
                message: 'Shared a file',
                mediaUrl: result.url,
                mediaType: mediaType
            });
        }
    } catch (error) {
        console.error('Upload error:', error);
        addMessage('System', 'Failed to upload file. Please try again.', null, null, true);
    }

    fileInput.value = '';
});

// Room functions

// Handle browser back/forward buttons
window.addEventListener('popstate', (event) => {
    if (!event.state || !event.state.roomId) {
        chatContainer.classList.add('hidden');
        welcomeContainer.classList.remove('hidden');
    }
});

// Check for room ID in URL when page loads
document.addEventListener('DOMContentLoaded', () => {
    const path = window.location.pathname;
    const roomId = path.substring(1); // Remove the leading slash
    
    if (roomId) {
        socket.emit('joinRoom', { roomId });
        chatContainer.classList.remove('hidden');
        welcomeContainer.classList.add('hidden');
    }
});

// Function to update expiry timer
function updateExpiryTimer(expiresIn) {
    let timerElement = document.getElementById('expiry-timer');
    if (!timerElement) {
        timerElement = document.createElement('div');
        timerElement.id = 'expiry-timer';
        timerElement.className = 'expiry-timer';
        chatContainer.insertBefore(timerElement, messagesDiv);
    }
    
    const updateTimer = () => {
        const minutesLeft = Math.floor(expiresIn / 60);
        const secondsLeft = Math.floor(expiresIn % 60);
        
        if (expiresIn <= 0) {
            timerElement.innerHTML = 'Room has expired';
            addMessage('System', 'This room has expired. Redirecting to home...');
            return;
        }
        
        timerElement.innerHTML = `Room expires in: ${minutesLeft}m ${secondsLeft}s`;
        expiresIn -= 1;
    };
    
    updateTimer();
    const timerId = setInterval(updateTimer, 1000);
    setTimeout(() => clearInterval(timerId), expiresIn * 1000);
}

// Event listeners
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

copyUrlButton.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href)
        .then(() => {
            const originalText = copyUrlButton.textContent;
            copyUrlButton.textContent = 'Copied!';
            setTimeout(() => {
                copyUrlButton.textContent = originalText;
            }, 2000);
        })
        .catch(err => {
            console.error('Failed to copy URL:', err);
            alert('Failed to copy URL. Please copy it manually.');
        });
});

// Add some CSS styles
const style = document.createElement('style');
style.textContent = `
    .message {
        margin: 10px;
        padding: 10px;
        border-radius: 8px;
        max-width: 80%;
    }

    .own-message {
        background-color: #2196f3;
        color: white;
        margin-left: auto;
    }

    .other-message {
        background-color: #424242;
        color: white;
        margin-right: auto;
    }

    .system-message {
        background-color: #333;
        color: #888;
        text-align: center;
        margin: 10px auto;
    }

    .shared-media {
        max-width: 100%;
        max-height: 300px;
        margin-top: 10px;
        border-radius: 4px;
    }
`;
document.head.appendChild(style);
