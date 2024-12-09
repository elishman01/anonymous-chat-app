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
        origin: "https://anonymousweb.netlify.app",
        methods: ["GET", "POST"],
        allowedHeaders: ["*"],
        credentials: true
    },
    allowEIO3: true,
    transports: ['websocket', 'polling']
});

// Enable CORS for Express
app.use(cors({
    origin: "https://anonymousweb.netlify.app",
    methods: ["GET", "POST"],
    allowedHeaders: ["*"],
    credentials: true
}));

// Store active rooms and their timeouts
const activeRooms = new Map();
const ROOM_EXPIRY_TIME = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

// Function to remove room and notify users
function removeRoom(roomId) {
    const room = activeRooms.get(roomId);
    if (room) {
        // Notify users in the room
        io.to(roomId).emit('message', {
            userId: 'System',
            message: 'This room has expired. Please create a new room.'
        });
        
        // Disconnect all users from the room
        io.in(roomId).disconnectSockets();
        
        // Clear the timeout and delete the room
        clearTimeout(room.timeout);
        activeRooms.delete(roomId);
        
        console.log(`Room ${roomId} has expired and been removed`);
    }
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// File upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
    console.log('Upload request received');
    try {
        if (!req.file) {
            console.log('No file in request');
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('File uploaded successfully:', req.file);
        // Return the Cloudinary URL
        res.json({ 
            url: req.file.path,
            type: req.file.resource_type
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Upload failed' });
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

// WebSocket connection
io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle room joining
    socket.on('join-room', (roomId) => {
        // Check if room exists or create it
        if (!activeRooms.has(roomId)) {
            // Set up room expiration
            const timeout = setTimeout(() => removeRoom(roomId), ROOM_EXPIRY_TIME);
            activeRooms.set(roomId, {
                createdAt: Date.now(),
                timeout: timeout
            });
            console.log(`Created new room: ${roomId}`);
        }

        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);

        // Send room expiry time to user
        const room = activeRooms.get(roomId);
        const expiresIn = (room.createdAt + ROOM_EXPIRY_TIME - Date.now()) / 1000;
        
        socket.emit('room-info', {
            roomId: roomId,
            expiresIn: expiresIn,
            message: `Room will expire in ${Math.floor(expiresIn / 60)} minutes`
        });
    });

    socket.on('message', (msg) => {
        // Get the rooms this socket is in
        const rooms = Array.from(socket.rooms);
        // The first room is always the socket's ID, so we want the second one
        const roomId = rooms[1];
        
        if (roomId && activeRooms.has(roomId)) {
            // Broadcast to the specific room
            io.to(roomId).emit('message', msg);
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
