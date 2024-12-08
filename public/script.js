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
const BACKEND_URL = 'https://anonymous-chat-app-3qm1.onrender.com';
const socket = io(BACKEND_URL);

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
function createRoom() {
    console.log('Creating room...');
    const roomId = Math.random().toString(36).substring(2, 10);
    console.log('Generated room ID:', roomId);
    
    socket.emit('join-room', roomId);
    window.history.pushState({}, '', `/${roomId}`);
    
    welcomeContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    
    addMessage('System', 'Room created! Share this URL with others to chat anonymously.');
}

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

// Check for existing room
const roomId = window.location.pathname.substring(1);
if (roomId) {
    console.log('Joining existing room:', roomId);
    socket.emit('join-room', roomId);
    welcomeContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
}
