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

// DOM Elements
const chatContainer = document.getElementById('chat-container');
const welcomeContainer = document.getElementById('welcome-container');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');

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
    
    // Update timer every minute
    const updateTimer = () => {
        const hoursLeft = Math.floor(expiresIn / 3600);
        const minutesLeft = Math.floor((expiresIn % 3600) / 60);
        
        if (expiresIn <= 0) {
            timerElement.innerHTML = 'Room has expired';
            addMessage('System', 'This room has expired. Please create a new room.');
            setTimeout(() => window.location.href = '/', 3000);
            return;
        }
        
        timerElement.innerHTML = `Room expires in: ${hoursLeft}h ${minutesLeft}m`;
        expiresIn -= 60; // Decrease by one minute
    };
    
    updateTimer(); // Initial update
    setInterval(updateTimer, 60000); // Update every minute
}

function createRoom() {
    console.log('Creating room...');
    // Generate a random room ID
    const roomId = Math.random().toString(36).substring(2, 10);
    console.log('Generated room ID:', roomId);
    
    // Join the room
    socket.emit('join-room', roomId);
    
    // Update URL with room ID
    window.history.pushState({}, '', `/${roomId}`);
    
    // Show chat interface
    welcomeContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    
    // Add room creation message
    addMessage('System', 'Room created! Share this URL with others to chat anonymously.');
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (message) {
        console.log('Sending message:', message);
        // Emit the message to the server
        socket.emit('message', {
            userId,
            message,
            timestamp: new Date().toISOString()
        });
        
        // Clear input
        messageInput.value = '';
    }
}

// Handle incoming messages
socket.on('message', (data) => {
    console.log('Received message:', data);
    addMessage(data.userId === userId ? 'You' : 'Anonymous', data.message);
});

function addMessage(sender, text) {
    console.log('Adding message from', sender, ':', text);
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender === 'You' ? 'sent' : ''}`;
    messageElement.innerHTML = `
        <strong>${sender}:</strong>
        <p>${text}</p>
    `;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

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
