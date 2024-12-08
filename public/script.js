// Connect to Socket.IO server
const socket = io('https://anonymous-chat-app-3qm1.onrender.com');

// Add connection event handlers
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    addMessage('System', 'Connection error. Please try again.');
});

// Handle disconnection
socket.on('disconnect', (reason) => {
    console.log('Disconnected:', reason);
    if (reason === 'io server disconnect') {
        // Server forcefully disconnected us, redirect to home
        addMessage('System', 'Room has expired or been closed.');
        window.location.href = '/';
    }
});

// DOM Elements
const chatContainer = document.getElementById('chat-container');
const welcomeContainer = document.getElementById('welcome-container');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');

// Handle file selection
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Create temporary message for upload status
    const tempMessage = addMessage('You', 'Uploading file...');
    tempMessage.classList.add('uploading');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('https://anonymous-chat-app-3qm1.onrender.com/upload', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error('Upload failed');

        const data = await response.json();
        
        // Remove temporary message
        tempMessage.remove();

        // Send the media message
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

    // Clear the file input
    fileInput.value = '';
});

// Generate a random user ID
const userId = Math.random().toString(36).substring(2, 15);

// Handle room expiration info
socket.on('room-info', (data) => {
    console.log('Room info received:', data);
    addMessage('System', data.message);
    
    // Start countdown timer
    updateExpiryTimer(data.expiresIn);
});

function updateExpiryTimer(expiresIn) {
    // Create or get timer element
    let timerElement = document.getElementById('expiry-timer');
    if (!timerElement) {
        timerElement = document.createElement('div');
        timerElement.id = 'expiry-timer';
        timerElement.className = 'expiry-timer';
        chatContainer.insertBefore(timerElement, messagesDiv);
    }
    
    // Update timer every second
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

// Handle incoming messages
socket.on('message', (data) => {
    console.log('Received message:', data);
    const sender = data.userId === userId ? 'You' : 'Anonymous';
    
    // Create message element
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender === 'You' ? 'sent' : ''}`;
    
    // Build message content
    let content = `<strong>${sender}:</strong>`;
    
    if (data.mediaUrl) {
        if (data.mediaType === 'image') {
            content += `<p><img src="${data.mediaUrl}" alt="Shared image"></p>`;
        } else if (data.mediaType === 'video') {
            content += `<p><video controls src="${data.mediaUrl}"></video></p>`;
        }
    }
    
    if (data.message) {
        content += `<p>${data.message}</p>`;
    }
    
    messageElement.innerHTML = content;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    return messageElement;
});

// Handle enter key in message input
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Check if we're joining an existing room
const roomId = window.location.pathname.substring(1);
if (roomId) {
    console.log('Joining existing room:', roomId);
    socket.emit('join-room', roomId);
    welcomeContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
}
