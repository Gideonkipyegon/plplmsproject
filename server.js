const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const sql = require('mssql');
const { check, validationResult } = require('express-validator');
const { body } = require('express-validator');

const app = express();

// Configure session middleware
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true
}));

// Configure SQL Server connection
const config = {
    user: 'sa',
    password: '1234',
    server: 'localhost',
    database: 'learning_management',
    options: {
        encrypt: true, // Use encryption
        trustServerCertificate: true // Trust the self-signed certificate
    }
};

// Create a pool of connections
const poolPromise = new sql.ConnectionPool(config)
    .connect()
    .then(pool => {
        console.log('Connected to SQL Server');
        return pool;
    })
    .catch(err => {
        console.error('Error connecting to SQL Server:', err);
        process.exit(1); // Exit the application on connection failure
    });

// Serve static files from the default directory
app.use(express.static(__dirname));

// Set up middleware to parse incoming JSON data
app.use(express.json());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.urlencoded({ extended: true }));

// Define routes
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Define a User representation for clarity
const User = {
    tableName: 'users',
    createUser: async function(newUser) {
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('email', sql.VarChar, newUser.email)
                .input('username', sql.VarChar, newUser.username)
                .input('password', sql.VarChar, newUser.password)
                .input('full_name', sql.VarChar, newUser.full_name)
                .query(`INSERT INTO ${this.tableName} (email, username, password, full_name) VALUES (@email, @username, @password, @full_name)`);
            return result;
        } catch (err) {
            console.error('Error inserting user:', err);
            throw err;
        }
    },
    getUserByEmail: async function(email) {
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('email', sql.VarChar, email)
                .query(`SELECT * FROM ${this.tableName} WHERE email = @email`);
            return result.recordset[0]; // Assuming email is unique
        } catch (err) {
            console.error('Error retrieving user by email:', err);
            throw err;
        }
    },
    getUserByUsername: async function(username) {
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('username', sql.VarChar, username)
                .query(`SELECT * FROM ${this.tableName} WHERE username = @username`);
            return result.recordset[0]; // Assuming username is unique
        } catch (err) {
            console.error('Error retrieving user by username:', err);
            throw err;
        }
    }
};

// Validation middleware
app.post('/register', [
    body('email').isEmail().normalizeEmail(),
    body('username').isLength({ min: 5 }),
    body('password').isLength({ min: 8 }),
    body('full_name').isLength({ min: 3 })
], async(req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { email, username, password, full_name } = req.body;

    try {
        // Check if user already exists with the provided email or username
        const existingEmailUser = await User.getUserByEmail(email);
        const existingUsernameUser = await User.getUserByUsername(username);
        if (existingEmailUser) {
            return res.status(400).json({ message: 'Email already exists' });
        }
        if (existingUsernameUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // Hash the password before saving it to the database
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create new user in the database
        await User.createUser({
            email,
            username,
            password: hashedPassword,
            full_name
        });

        return res.status(201).json({ message: 'User registered successfully' });
    } catch (err) {
        console.error('Error registering user:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});