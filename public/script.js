// Connect to Socket.IO server
const socket = io();

// DOM Elements
const chatContainer = document.getElementById('chat-container');
const welcomeContainer = document.getElementById('welcome-container');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');

// Generate a random user ID
const userId = Math.random().toString(36).substring(2, 15);

function createRoom() {
    // Generate a random room ID
    const roomId = Math.random().toString(36).substring(2, 10);
    
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
    addMessage(data.userId === userId ? 'You' : 'Anonymous', data.message);
});

function addMessage(sender, text) {
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
    socket.emit('join-room', roomId);
    welcomeContainer.classList.add('hidden');
    chatContainer.classList.remove('hidden');
    addMessage('System', 'Connected to chat room.');
}
