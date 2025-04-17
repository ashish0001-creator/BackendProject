const fs = require('fs').promises;
const bcrypt = require('bcrypt');
const path = require('path');

const USERS_FILE = 'data/users.json';

async function ensureDataDirectory() {
    try {
        await fs.mkdir('data', { recursive: true });
    } catch (error) {
        console.error('Error creating data directory:', error);
    }
}

async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

async function initializeUsers() {
    try {
        await ensureDataDirectory();

        // Check if users file exists
        let users = [];
        try {
            const data = await fs.readFile(USERS_FILE, 'utf8');
            users = JSON.parse(data);
        } catch (error) {
            // File doesn't exist or is empty, create new users array
            users = [];
        }

        // Check if users are already initialized
        if (users.length > 0) {
            console.log('Users already initialized');
            return;
        }

        // Create default users
        const defaultUsers = [
            {
                id: '1',
                role: 'student',
                name: 'John Doe',
                username: 'student',
                password: await hashPassword('student123')
            },
            {
                id: '2',
                role: 'warden',
                name: 'Jane Smith',
                username: 'warden',
                password: await hashPassword('warden123')
            }
        ];

        // Save users to file
        await fs.writeFile(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
        console.log('Default users initialized successfully');
    } catch (error) {
        console.error('Error initializing users:', error);
    }
}

initializeUsers(); 