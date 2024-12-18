// DOM Elements
const chatContainer = document.getElementById('chat-container');
const welcomeContainer = document.getElementById('welcome-container');
const messagesDiv = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const userCountElement = document.getElementById('user-count');
const copyUrlButton = document.getElementById('copy-url');
const uploadTrigger = document.getElementById('upload-trigger');
const sendMessageButton = document.getElementById('send-message');
const createRoomButton = document.getElementById('create-room');
const roomExpiryElement = document.getElementById('room-expiry');

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
    return messageDiv;
}

// Connect to Socket.IO server
const BACKEND_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000'
    : 'https://anonymous-chat-backend-8m4i.onrender.com';

let currentRoomId = null;

const socket = io({
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
});

// Handle connection events
socket.on('connect', () => {
    console.log('Connected to server');
    const roomId = window.location.pathname.split('/').pop();
    if (roomId && roomId.length > 0) {
        currentRoomId = roomId;
        console.log('Attempting to join room:', roomId);
        socket.emit('join-room', roomId);
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server. Trying to reconnect...');
    addMessage('System', 'Disconnected from server. Trying to reconnect...', null, null, true);
});

socket.on('reconnect', () => {
    console.log('Reconnected to server');
    addMessage('System', 'Reconnected to server!', null, null, true);
    
    if (currentRoomId) {
        console.log('Rejoining room:', currentRoomId);
        socket.emit('join-room', currentRoomId);
    }
});

socket.on('reconnect_failed', () => {
    console.log('Failed to reconnect');
    addMessage('System', 'Failed to reconnect to server. Please refresh the page.', null, null, true);
});

socket.on('room-expired', () => {
    addMessage('System', 'Room has expired. Please create a new room.', null, null, true);
    // Optionally redirect to home page
    window.location.href = '/';
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
    document.getElementById('copy-url').classList.remove('hidden'); 
    document.getElementById('user-count').classList.remove('hidden');
    document.getElementById('room-expiry').classList.remove('hidden');
    
    // Update expiry display with server-provided time
    if (data.expiryTime) {
        updateExpiryDisplay(data.expiryTime);
    }
});

socket.on('room-joined', (data) => {
    console.log('Room joined successfully:', data);
    document.getElementById('welcome-container').style.display = 'none';
    document.getElementById('chat-container').classList.remove('hidden');
    document.getElementById('copy-url').classList.remove('hidden'); 
    document.getElementById('user-count').classList.remove('hidden');
    document.getElementById('room-expiry').classList.remove('hidden');
    
    // Get remaining time from server
    if (data.expiryTime) {
        updateExpiryDisplay(data.expiryTime);
    }
});

socket.on('error', (data) => {
    console.error('Server error:', data);
    addMessage('System', data.message, null, null, true);
});

socket.on('user-count', (data) => {
    const userCountElement = document.getElementById('user-count');
    if (data && typeof data.count === 'number') {
        userCountElement.textContent = `Users: ${data.count}`;
    } else {
        userCountElement.textContent = 'Users: 0';
    }
});

// Handle messages
socket.on('message', (data) => {
    const messageElement = addMessage(data.userId, data.message, data.mediaUrl, data.mediaType);
    if (data.userId === 'You') {
        messageElement.classList.add('self');
        // Remove sending state after a short delay
        setTimeout(() => {
            messageElement.classList.remove('sending');
        }, 300);
    } else {
        messageElement.classList.add('other');
    }
});

// Function to create a room
function createRoom() {
    console.log('Creating room...');
    socket.emit('create-room');
}

// Function to send a message
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    try {
        toggleSendLoading(true);
        socket.emit('message', { message });
        messageInput.value = '';
        
        // Don't add message here, wait for server confirmation
    } catch (error) {
        console.error('Send error:', error);
        addMessage('System', 'Failed to send message. Please try again.', null, null, true);
    } finally {
        toggleSendLoading(false);
    }
}

// Function to show/hide loading state for send button
function toggleSendLoading(show) {
    const btnText = document.querySelector('#send-message .btn-text');
    const btnLoading = document.querySelector('#send-message .btn-loading');
    btnText.classList.toggle('hidden', show);
    btnLoading.classList.toggle('hidden', !show);
}

// Function to update upload progress
function updateUploadProgress(progress) {
    const progressBar = document.querySelector('.progress-bar');
    const uploadProgress = document.querySelector('.upload-progress');
    
    if (progress === 0) {
        uploadProgress.classList.remove('hidden');
    } else if (progress === 100) {
        setTimeout(() => {
            uploadProgress.classList.add('hidden');
        }, 500);
    }
    
    progressBar.style.width = `${progress}%`;
}

// Function to show typing indicator
function showTypingIndicator() {
    const typingIndicator = document.querySelector('.typing-indicator');
    typingIndicator.classList.remove('hidden');
    setTimeout(() => {
        typingIndicator.classList.add('hidden');
    }, 3000);
}

// Handle file uploads
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
        updateUploadProgress(0);
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const progress = (e.loaded / e.total) * 100;
                updateUploadProgress(progress);
            }
        };

        xhr.onload = async () => {
            if (xhr.status === 200) {
                const response = JSON.parse(xhr.responseText);
                updateUploadProgress(100);
                socket.emit('message', {
                    message: 'Shared a file',
                    mediaUrl: response.url,
                    mediaType: file.type.startsWith('image/') ? 'image' : 'video'
                });
            }
        };

        xhr.onerror = () => {
            updateUploadProgress(0);
            addMessage('System', 'Failed to upload file. Please try again.', null, null, true);
        };

        xhr.open('POST', `${BACKEND_URL}/upload`);
        xhr.send(formData);
    } catch (error) {
        console.error('Upload error:', error);
        updateUploadProgress(0);
        addMessage('System', 'Failed to upload file. Please try again.', null, null, true);
    }
});

// Handle typing indicator
let typingTimeout;
messageInput.addEventListener('input', () => {
    if (!typingTimeout) {
        socket.emit('typing');
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        typingTimeout = null;
    }, 1000);
});

// Listen for typing events
socket.on('typing', (data) => {
    if (data.userId !== userId) {
        showTypingIndicator();
    }
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

    // File upload trigger
    uploadTrigger.addEventListener('click', () => {
        fileInput.click();
    });

    // Send message button
    sendMessageButton.addEventListener('click', sendMessage);

    // Create room button click handler
    createRoomButton.addEventListener('click', () => {
        console.log('Creating room...');
        socket.emit('create-room');
    });

    // Message input enter key
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    // Copy URL button
    copyUrlButton.addEventListener('click', () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            const button = copyUrlButton;
            button.textContent = 'Copied!';
            setTimeout(() => {
                button.textContent = 'Copy Room URL';
            }, 2000);
        });
    });
});

// Room expiry handling
let expiryInterval;

function updateExpiryDisplay(expiryTime) {
    clearInterval(expiryInterval);
    const roomExpiryElement = document.getElementById('room-expiry');
    
    expiryInterval = setInterval(() => {
        const now = new Date().getTime();
        const timeLeft = expiryTime - now;
        
        if (timeLeft <= 0) {
            clearInterval(expiryInterval);
            roomExpiryElement.textContent = 'Room expired';
            roomExpiryElement.classList.add('critical');
            return;
        }
        
        // Calculate hours, minutes, seconds
        const hours = Math.floor(timeLeft / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        
        // Format display
        let display = 'Expires in: ';
        if (hours > 0) {
            display += `${hours}h `;
        }
        if (minutes > 0 || hours > 0) {
            display += `${minutes}m `;
        }
        display += `${seconds}s`;
        
        roomExpiryElement.textContent = display;
        
        // Add warning classes based on time left
        if (timeLeft < 5 * 60 * 1000) { // Less than 5 minutes
            roomExpiryElement.classList.remove('warning');
            roomExpiryElement.classList.add('critical');
        } else if (timeLeft < 30 * 60 * 1000) { // Less than 30 minutes
            roomExpiryElement.classList.add('warning');
            roomExpiryElement.classList.remove('critical');
        }
    }, 1000);
}

socket.on('room-expired', () => {
    clearInterval(expiryInterval);
    roomExpiryElement.textContent = 'Room expired';
    roomExpiryElement.classList.add('critical');
    addMessage('System', 'Room has expired. Please create a new room.', null, null, true);
    // Redirect to home page after a delay
    setTimeout(() => {
        window.location.href = '/';
    }, 3000);
});

socket.on('room-expiry', (data) => {
    if (data.timeLeft) {
        const expiryTime = new Date().getTime() + data.timeLeft;
        updateExpiryDisplay(expiryTime);
    }
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
