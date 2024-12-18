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

    socket.on('createRoom', async ({ roomId }) => {
        try {
            socket.join(roomId);
            activeRooms.set(roomId, {
                created: Date.now(),
                timeout: setTimeout(() => removeRoom(roomId), ROOM_EXPIRY_TIME)
            });
            
            socket.emit('message', {
                userId: 'System',
                message: 'Room created! Share this URL with others to chat anonymously.'
            });
            
            // Send room expiry time
            socket.emit('roomExpiry', { expiresIn: ROOM_EXPIRY_TIME / 1000 });
            
            console.log(`Room ${roomId} created`);
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('error', { message: 'Error creating room' });
        }
    });

    socket.on('joinRoom', ({ roomId }) => {
        if (activeRooms.has(roomId)) {
            socket.join(roomId);
            socket.emit('message', {
                userId: 'System',
                message: 'Welcome to the chat room!'
            });
            
            const room = activeRooms.get(roomId);
            const timeLeft = ROOM_EXPIRY_TIME - (Date.now() - room.created);
            socket.emit('roomExpiry', { expiresIn: Math.max(0, timeLeft / 1000) });
        } else {
            socket.emit('message', {
                userId: 'System',
                message: 'Room not found or has expired.'
            });
        }
    });

    // Handle messages
    socket.on('message', (data) => {
        console.log('Message received:', data);
        const roomId = Array.from(socket.rooms)[1]; // First room is socket ID, second is chat room
        if (roomId && activeRooms.has(roomId)) {
            const messageData = {
                userId: socket.id === data.userId ? 'You' : 'Anonymous',
                message: data.message,
                mediaUrl: data.mediaUrl,
                mediaType: data.mediaType,
                timestamp: new Date().toISOString()
            };
            
            console.log('Broadcasting message:', messageData);
            io.to(roomId).emit('message', messageData);
        } else {
            console.log('Message not sent - invalid room:', roomId);
            socket.emit('message', {
                userId: 'System',
                message: 'Error: Not connected to a valid room'
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
