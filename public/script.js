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
    transports: ['websocket'],
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
    path: '/socket.io'
});

// Socket event handlers
socket.on('connect_error', (error) => {
    console.log('Connection error:', error);
    addMessage('System', 'Connection error. Please try again.');
});

socket.on('connect', () => {
    console.log('Connected to server');
    const path = window.location.pathname;
    const roomId = path.substring(1);
    if (roomId) {
        socket.emit('joinRoom', { roomId });
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    addMessage('System', 'Disconnected from server. Trying to reconnect...');
});

socket.on('message', (data) => {
    console.log('Received message:', data);
    if (typeof data === 'object') {
        if (data.userId && data.message) {
            addMessage(data.userId, data.message, data.mediaUrl, data.mediaType);
        } else {
            console.error('Invalid message format:', data);
        }
    } else {
        console.error('Invalid message data:', data);
    }
});

socket.on('room-info', (data) => {
    console.log('Room info received:', data);
    addMessage('System', data.message);
    updateExpiryTimer(data.expiresIn);
});

socket.on('user-count', (count) => {
    userCountElement.textContent = `Users: ${count}`;
});

socket.on('room-expiry', (data) => {
    const minutes = Math.ceil(data.timeLeft / 60000);
    addMessage('System', `Room will expire in ${minutes} minute${minutes === 1 ? '' : 's'}. Create a new room to continue chatting.`);
});

socket.on('room-expired', () => {
    addMessage('System', 'Room has expired. Please create a new room to continue chatting.');
    setTimeout(() => {
        window.location.href = '/';
    }, 5000);
});

// File upload handling
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        addMessage('System', 'Uploading file...');
        
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
        addMessage('System', 'Failed to upload file. Please try again.');
    }

    // Clear the file input
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
