const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));
app.use(session({
    secret: 'hostel-management-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // set to true if using https
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Data file paths
const USERS_FILE = 'data/users.json';
const ROOMS_FILE = 'data/rooms.json';
const COMPLAINTS_FILE = 'data/complaints.json';
const FINES_FILE = 'data/fines.json';
const GATEPASS_FILE = 'data/gatepass.json';

// Ensure data directory exists
async function ensureDataDirectory() {
    try {
        await fs.mkdir('data', { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

// Initialize data files if they don't exist
async function initializeDataFiles() {
    await ensureDataDirectory();
    
    const files = {
        [USERS_FILE]: [],
        [ROOMS_FILE]: [],
        [COMPLAINTS_FILE]: [],
        [FINES_FILE]: [],
        [GATEPASS_FILE]: []
    };

    for (const [file, defaultData] of Object.entries(files)) {
        try {
            await fs.access(file);
        } catch {
            await fs.writeFile(file, JSON.stringify(defaultData, null, 2));
        }
    }
}

// Authentication middleware
const authenticate = (req, res, next) => {
    if (!req.session.user) {
        if (req.xhr) {
            return res.status(401).json({ success: false, message: 'Not authenticated' });
        }
        return res.redirect('/login.html');
    }
    next();
};

// Serve login page for root URL
app.get('/', (req, res) => {
    res.redirect('/login.html');
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        console.log('Login attempt:', req.body); // Debug log
        const { role, username, password } = req.body;
        
        if (!role || !username || !password) {
            console.log('Missing fields:', { role, username, password: '***' });
            return res.status(400).json({ 
                success: false, 
                message: 'All fields are required' 
            });
        }

        // Read users file
        const usersData = await fs.readFile(USERS_FILE, 'utf8');
        console.log('Users file content:', usersData); // Debug log
        const users = JSON.parse(usersData);
        
        // Find user
        const user = users.find(u => u.username === username && u.role === role);
        console.log('Found user:', user ? { ...user, password: '***' } : null); // Debug log

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        // Verify password
        const validPassword = await bcrypt.compare(password, user.password);
        console.log('Password valid:', validPassword); // Debug log

        if (!validPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }

        // Set session
        req.session.user = {
            id: user.id,
            role: user.role,
            name: user.name
        };
        console.log('Session created:', req.session.user); // Debug log

        res.json({
            success: true,
            user: {
                id: user.id,
                role: user.role,
                name: user.name
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Internal server error',
            error: error.message // Include error message in development
        });
    }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: 'Error logging out' 
            });
        }
        res.json({ success: true });
    });
});

// Protected routes
app.get('/student-dashboard.html', authenticate, (req, res, next) => {
    if (req.session.user.role !== 'student') {
        return res.redirect('/login.html');
    }
    next();
});

app.get('/warden-dashboard.html', authenticate, (req, res, next) => {
    if (req.session.user.role !== 'warden') {
        return res.redirect('/login.html');
    }
    next();
});

// API Endpoints

// Room Management
app.post('/api/rooms/book', authenticate, async (req, res) => {
    try {
        const { roomNumber } = req.body;
        const userId = req.session.user.id;

        const rooms = JSON.parse(await fs.readFile(ROOMS_FILE, 'utf8'));
        const existingRoom = rooms.find(r => r.roomNumber === roomNumber);

        if (existingRoom) {
            return res.status(400).json({ success: false, message: 'Room already booked' });
        }

        rooms.push({
            roomNumber,
            studentId: userId,
            status: 'booked'
        });

        await fs.writeFile(ROOMS_FILE, JSON.stringify(rooms, null, 2));
        res.json({ success: true, message: 'Room booked successfully' });
    } catch (error) {
        console.error('Room booking error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Complaint Management
app.post('/api/complaints', authenticate, async (req, res) => {
    try {
        const { type, description } = req.body;
        const userId = req.session.user.id;
        const userName = req.session.user.name;

        const complaints = JSON.parse(await fs.readFile(COMPLAINTS_FILE, 'utf8'));
        complaints.push({
            id: Date.now().toString(),
            studentId: userId,
            studentName: userName,
            type,
            description,
            status: 'pending',
            date: new Date().toISOString()
        });

        await fs.writeFile(COMPLAINTS_FILE, JSON.stringify(complaints, null, 2));
        res.json({ success: true, message: 'Complaint submitted successfully' });
    } catch (error) {
        console.error('Complaint submission error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Get all complaints (for warden)
app.get('/api/complaints', authenticate, async (req, res) => {
    try {
        if (req.session.user.role !== 'warden') {
            return res.status(403).json({ success: false, message: 'Only wardens can view all complaints' });
        }

        const complaints = JSON.parse(await fs.readFile(COMPLAINTS_FILE, 'utf8'));
        res.json({ success: true, complaints });
    } catch (error) {
        console.error('Get complaints error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Get student's complaints
app.get('/api/student/complaints', authenticate, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const complaints = JSON.parse(await fs.readFile(COMPLAINTS_FILE, 'utf8'));
        const studentComplaints = complaints.filter(c => c.studentId === userId);
        res.json({ success: true, complaints: studentComplaints });
    } catch (error) {
        console.error('Get student complaints error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Update complaint status
app.put('/api/complaints/:id/:action', authenticate, async (req, res) => {
    try {
        if (req.session.user.role !== 'warden') {
            return res.status(403).json({ success: false, message: 'Only wardens can update complaints' });
        }

        const { id, action } = req.params;
        const complaints = JSON.parse(await fs.readFile(COMPLAINTS_FILE, 'utf8'));
        const complaintIndex = complaints.findIndex(c => c.id === id);

        if (complaintIndex === -1) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }

        complaints[complaintIndex].status = action === 'resolve' ? 'resolved' : 'rejected';
        await fs.writeFile(COMPLAINTS_FILE, JSON.stringify(complaints, null, 2));

        res.json({ success: true, message: `Complaint ${action}d successfully` });
    } catch (error) {
        console.error('Update complaint error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Fine Management
app.post('/api/fines', authenticate, async (req, res) => {
    try {
        const { studentId, amount, reason } = req.body;
        
        if (req.session.user.role !== 'warden') {
            return res.status(403).json({ success: false, message: 'Only wardens can add fines' });
        }

        const fines = JSON.parse(await fs.readFile(FINES_FILE, 'utf8'));
        fines.push({
            id: Date.now().toString(),
            studentId,
            amount,
            reason,
            status: 'pending',
            date: new Date().toISOString()
        });

        await fs.writeFile(FINES_FILE, JSON.stringify(fines, null, 2));
        res.json({ success: true, message: 'Fine added successfully' });
    } catch (error) {
        console.error('Fine addition error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Get student's fines
app.get('/api/student/fines', authenticate, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const fines = JSON.parse(await fs.readFile(FINES_FILE, 'utf8'));
        const studentFines = fines.filter(f => f.studentId === userId);
        res.json({ success: true, fines: studentFines });
    } catch (error) {
        console.error('Get student fines error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Gate Pass Management
app.post('/api/gatepass', authenticate, async (req, res) => {
    try {
        const { reason, date, time } = req.body;
        const userId = req.session.user.id;
        const userName = req.session.user.name;

        const gatepasses = JSON.parse(await fs.readFile(GATEPASS_FILE, 'utf8'));
        gatepasses.push({
            id: Date.now().toString(),
            studentId: userId,
            studentName: userName,
            reason,
            date,
            time,
            status: 'pending'
        });

        await fs.writeFile(GATEPASS_FILE, JSON.stringify(gatepasses, null, 2));
        res.json({ success: true, message: 'Gate pass applied successfully' });
    } catch (error) {
        console.error('Gate pass application error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Get all gate passes (for warden)
app.get('/api/gatepass', authenticate, async (req, res) => {
    try {
        if (req.session.user.role !== 'warden') {
            return res.status(403).json({ success: false, message: 'Only wardens can view all gate passes' });
        }

        const gatepasses = JSON.parse(await fs.readFile(GATEPASS_FILE, 'utf8'));
        res.json({ success: true, gatepasses });
    } catch (error) {
        console.error('Get gate passes error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Get student's gate passes
app.get('/api/student/gatepass', authenticate, async (req, res) => {
    try {
        const userId = req.session.user.id;
        const gatepasses = JSON.parse(await fs.readFile(GATEPASS_FILE, 'utf8'));
        const studentGatepasses = gatepasses.filter(g => g.studentId === userId);
        res.json({ success: true, gatepasses: studentGatepasses });
    } catch (error) {
        console.error('Get student gate passes error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Update gate pass status
app.put('/api/gatepass/:id', authenticate, async (req, res) => {
    try {
        if (req.session.user.role !== 'warden') {
            return res.status(403).json({ success: false, message: 'Only wardens can update gate pass status' });
        }

        const { id } = req.params;
        const { status } = req.body;

        const gatepasses = JSON.parse(await fs.readFile(GATEPASS_FILE, 'utf8'));
        const gatepassIndex = gatepasses.findIndex(g => g.id === id);

        if (gatepassIndex === -1) {
            return res.status(404).json({ success: false, message: 'Gate pass not found' });
        }

        gatepasses[gatepassIndex].status = status;
        await fs.writeFile(GATEPASS_FILE, JSON.stringify(gatepasses, null, 2));

        res.json({ success: true, message: 'Gate pass status updated successfully' });
    } catch (error) {
        console.error('Update gate pass error:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Initialize data files and start server
initializeDataFiles().then(() => {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}); 