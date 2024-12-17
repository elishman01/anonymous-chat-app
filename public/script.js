// DOM Elements
const chatContainer = document.getElementById('chat-container');
const welcomeContainer = document.getElementById('welcome-container');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');

// Generate a random user ID
const userId = Math.random().toString(36).substring(2, 15);

// Function to add messages
function addMessage(sender, text, mediaUrl = null, mediaType = null) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender === 'You' ? 'sent' : ''}`;
    
    let content = `<strong>${sender}:</strong>`;
    
    if (mediaUrl) {
        if (mediaType === 'image') {
            content += `<p><img src="${mediaUrl}" alt="Shared image"></p>`;
        } else if (mediaType === 'video') {
            content += `<p><video controls src="${mediaUrl}"></video></p>`;
        }
    }
    
    if (text) {
        content += `<p>${text}</p>`;
    }
    
    messageElement.innerHTML = content;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    return messageElement;
}

// Connect to Socket.IO server
const BACKEND_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://anonymous-chat-backend-8m4i.onrender.com';

const socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    withCredentials: true
});

// Socket event handlers
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    addMessage('System', 'Connection error. Please try again.');
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
    if (reason === 'io server disconnect') {
        addMessage('System', 'Room has expired or been closed.');
        window.location.href = '/';
    }
});

socket.on('message', (data) => {
    console.log('Received message:', data);
    const sender = data.userId === userId ? 'You' : 'Anonymous';
    addMessage(sender, data.message, data.mediaUrl, data.mediaType);
});

socket.on('room-info', (data) => {
    console.log('Room info received:', data);
    addMessage('System', data.message);
    updateExpiryTimer(data.expiresIn);
});

// File upload handling
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const tempMessage = addMessage('You', 'Uploading file...');
    tempMessage.classList.add('uploading');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${BACKEND_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const data = await response.json();
        tempMessage.remove();

        socket.emit('message', {
            userId,
            message: '',
            mediaUrl: data.url,
            mediaType: data.type,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Upload error:', error);
        tempMessage.innerHTML = '<strong>You:</strong><p>Failed to upload file. Please try again.</p>';
        setTimeout(() => tempMessage.remove(), 3000);
    }

    fileInput.value = '';
});

// Room functions
async function createRoom() {
    try {
        const roomId = Math.random().toString(36).substring(2, 10);
        socket.emit('createRoom', { roomId });
        
        // Update URL without causing a page reload
        window.history.pushState({ roomId }, '', `/${roomId}`);
        
        // Show chat container and hide welcome container
        chatContainer.classList.remove('hidden');
        welcomeContainer.classList.add('hidden');
    } catch (error) {
        console.error('Error creating room:', error);
        addMessage('System', 'Error creating room. Please try again.');
    }
}

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

// Function to send message
function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        console.log('Sending message:', message);
        socket.emit('message', {
            userId,
            message,
            timestamp: new Date().toISOString()
        });
        
        messageInput.value = '';
    }
}

// Event listeners
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});
