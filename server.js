const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Verify Cloudinary configuration
const cloudinaryConfig = cloudinary.config();
if (!cloudinaryConfig.cloud_name || !cloudinaryConfig.api_key || !cloudinaryConfig.api_secret) {
    console.error('Cloudinary configuration is incomplete. Please check your environment variables.');
    process.exit(1);
}

console.log('Cloudinary configured successfully for cloud:', cloudinaryConfig.cloud_name);

// Configure Cloudinary storage
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'anonymous-chat',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'mp4', 'webm'],
        resource_type: 'auto'
    }
});

const upload = multer({ storage: storage });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: ['http://localhost:3000', 'https://anonymousweb.netlify.app'],
        methods: ['GET', 'POST'],
        credentials: true
    },
    path: '/socket.io',
    transports: ['websocket'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// CORS configuration
const corsOptions = {
    origin: [
        'http://localhost:3000',
        'https://anonymousweb.netlify.app'
    ],
    methods: ['GET', 'POST'],
    credentials: true
};

app.use(cors(corsOptions));

// Room management
const ROOM_EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours
const EXPIRY_WARNING_TIME = 10 * 60 * 1000; // 10 minutes

const activeRooms = new Map(); // roomId -> { users: Set, createdAt: timestamp }

function createRoom(roomId) {
    activeRooms.set(roomId, {
        users: new Set(),
        createdAt: Date.now(),
        expiryTimeout: null,
        warningTimeout: null
    });
}

function joinRoom(socket, roomId) {
    const room = activeRooms.get(roomId);
    if (!room) return false;

    room.users.add(socket.id);
    socket.join(roomId);
    
    // Broadcast updated user count
    io.to(roomId).emit('user-count', room.users.size);
    
    // Set expiry warning
    const timeLeft = (room.createdAt + ROOM_EXPIRY_TIME) - Date.now();
    if (timeLeft <= EXPIRY_WARNING_TIME) {
        socket.emit('room-expiry', { timeLeft });
    }

    return true;
}

function leaveRoom(socket, roomId) {
    const room = activeRooms.get(roomId);
    if (!room) return;

    room.users.delete(socket.id);
    socket.leave(roomId);
    
    // Broadcast updated user count
    io.to(roomId).emit('user-count', room.users.size);

    // Clean up empty rooms
    if (room.users.size === 0) {
        clearTimeout(room.expiryTimeout);
        clearTimeout(room.warningTimeout);
        activeRooms.delete(roomId);
    }
}

function generateRoomId() {
    return Math.random().toString(36).substr(2, 9);
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// File upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            throw new Error('No file uploaded');
        }

        console.log('File uploaded:', req.file);
        res.json({
            url: req.file.path,
            type: req.file.mimetype.startsWith('image/') ? 'image' : 'video'
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve index.html for the root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add route for room URLs
app.get('/:roomId', (req, res) => {
    const roomId = req.params.roomId;
    
    // Check if room exists and hasn't expired
    if (activeRooms.has(roomId)) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } else {
        // Redirect to home if room doesn't exist or has expired
        res.redirect('/');
    }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('create-room', () => {
        const roomId = generateRoomId();
        createRoom(roomId);
        
        // Set room expiry
        const room = activeRooms.get(roomId);
        room.expiryTimeout = setTimeout(() => {
            io.to(roomId).emit('room-expired');
            activeRooms.delete(roomId);
        }, ROOM_EXPIRY_TIME);

        // Set expiry warning
        room.warningTimeout = setTimeout(() => {
            io.to(roomId).emit('room-expiry', { timeLeft: EXPIRY_WARNING_TIME });
        }, ROOM_EXPIRY_TIME - EXPIRY_WARNING_TIME);

        joinRoom(socket, roomId);
        socket.emit('room-created', { roomId });
        socket.emit('message', {
            userId: 'System',
            message: 'Room created! Share this URL with others to chat anonymously.'
        });
    });

    socket.on('join-room', (roomId) => {
        console.log('Join room request:', roomId);
        if (joinRoom(socket, roomId)) {
            socket.emit('room-joined', { roomId });
            socket.emit('message', {
                userId: 'System',
                message: 'Welcome to the chat room!'
            });
            // Broadcast user count to all clients in the room
            const room = activeRooms.get(roomId);
            io.to(roomId).emit('user-count', room.users.size);
        } else {
            socket.emit('error', { message: 'Room not found or expired' });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Find and leave all rooms this socket was in
        for (const [roomId, room] of activeRooms.entries()) {
            if (room.users.has(socket.id)) {
                leaveRoom(socket, roomId);
                // Broadcast updated user count
                io.to(roomId).emit('user-count', room.users.size);
            }
        }
    });

    // Handle messages
    socket.on('message', (data) => {
        console.log('Message received:', data);
        // Get all rooms the socket is in
        const rooms = Array.from(socket.rooms);
        console.log('Socket rooms:', rooms);
        
        // Find the chat room (not the socket's default room)
        const roomId = rooms.find(room => room !== socket.id);
        console.log('Room ID found:', roomId);

        if (roomId && activeRooms.has(roomId)) {
            console.log('Sending message to room:', roomId);
            const messageData = {
                userId: socket.id,
                message: data.message,
                mediaUrl: data.mediaUrl,
                mediaType: data.mediaType,
                timestamp: new Date().toISOString()
            };
            
            // Send different messages to sender and other users
            socket.emit('message', {
                ...messageData,
                userId: 'You'
            });
            
            socket.to(roomId).emit('message', {
                ...messageData,
                userId: 'Anonymous'
            });
        } else {
            console.log('Invalid room. Socket rooms:', rooms);
            socket.emit('message', {
                userId: 'System',
                message: 'Error: Not connected to a valid room'
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
