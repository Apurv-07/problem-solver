const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { BlobServiceClient, ContainerClient } = require("@azure/storage-blob");
const path = require("path");

const dbPath = path.join(__dirname, "..", "database.db");

let conn = null;
console.log("HOME =", process.env.HOME);
console.log("DB Path =", dbPath);
const dbrun = async () => {
    console.log("WEBSITE_INSTANCE_ID =", process.env.WEBSITE_INSTANCE_ID);
    console.log("HOME =", process.env.HOME);
    console.log("HOME_EXPANDED =", process.env.HOME_EXPANDED);
    console.log("WEBROOT_PATH =", process.env.WEBROOT_PATH);
    console.log("PWD =", process.cwd());
    console.log("All WEBSITE vars:");
    Object.keys(process.env)
        .filter(k => k.startsWith("WEBSITE"))
        .sort()
        .forEach(k => console.log(`${k}=${process.env[k]}`));

    conn = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });
};
dbrun().catch((err) => {
    console.error("Failed to connect to the database:", err);
    process.exit(1);
});


const bsc = new BlobServiceClient(
    `https://${process.env.ACCOUNT_NAME}.blob.core.windows.net?${process.env.SAS_TOKEN}`
);
const cc = bsc.getContainerClient(process.env.CONTAINER);

const registrationService = async (req, res) => {
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    if (!username || !email || !password) {
        return res.status(400).send("All fields are required");
    }
    const user = await conn.get('SELECT * FROM users WHERE email = ?', [email]);
    if (user) {
        return res.status(400).send("User already exists");
    }
    try {
        const result = await conn.run('INSERT INTO users (name, email, passwords, points) VALUES (?, ?, ?, 10) RETURNING id', [username, email, hashedPassword]);
        console.log("User created with ID:", result);
        await conn.run('INSERT INTO activity(created_by, action_performed) VALUES (?, ?)', [result.lastID, `Registered as a new user and earned 10 points + a badge`]);
        await conn.run('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)', [result.lastID, 1]);
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }
    res.status(201).send("User created successfully");
}

const updateProfilePic = async (req, res) => {
    const userId = req.user.id + req.user.name;
    console.log("Updating profile picture for userId:", userId);
    const file = req.body.file; // This is a Base64 string

    if (!file) {
        res.status(400).send("No file uploaded");
        return;
    }

    try {
        // 1. Detect extension (Default to png, change to jpeg if match found)
        let extension = "png";
        if (file.includes("data:image/jpeg") || file.startsWith("/9j/")) {
            extension = "jpg";
        }

        // 2. Clean out the data prefix metadata if it exists
        const cleanBase64 = file.replace(/^data:image\/\w+;base64,/, "");

        // 3. Convert to buffer and get real size
        const buffer = Buffer.from(cleanBase64, 'base64');
        const fileSize = buffer.length;

        // 4. FIX: Generate a unique blob name using userId, a timestamp, and the extension
        const blobName = `${userId}_${Date.now()}_profile.${extension}`;
        console.log("uploading file:", blobName, "size:", fileSize, "bytes");

        // 5. Upload to Azure
        const blockBlobClient = cc.getBlockBlobClient(blobName);
        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: `image/${extension === 'jpg' ? 'jpeg' : 'png'}` }
        });

        console.log("Uploaded successfully:", blobName);

        // 6. Update local SQLite DB
        await conn.run('UPDATE users SET profile_pic = ? WHERE id = ?', [blobName, userId]);
        await conn.run('INSERT INTO activity(created_by, action_performed) VALUES (?, ?)', [userId, `Changed profile picture`]);

        res.status(200).send("Profile picture updated successfully");
    } catch (error) {
        console.error("Upload process crashed:", error);
        res.status(500).send("Internal server error handling image upload.");
    }
};

const getAllUsers = async (req, res) => {
    try {
        const allUsers = await conn.all(`SELECT * FROM users`);
        return res.status(200).send(allUsers);
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }
}


const loginService = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).send("All fields are required");
    }
    const user = await conn.get('SELECT * FROM users WHERE email = ?', [email]);
    // console.log(user);
    if (user && await bcrypt.compare(password, user.passwords)) {
        const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.cookie('token', token, { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }); // 1 day
        await conn.run('INSERT INTO activity(created_by, action_performed) VALUES (?, ?)', [user.id, `Logged in`]);
        res.status(200).json({ token });
    } else {
        res.status(401).send("Invalid email or password");
    }
}

const logoutService = (req, res) => {
    res.clearCookie('token');
    res.status(200).send("Logged out successfully");
}

const getProfile = async (req, res) => {
    const paramId = req.params.id;
    const isParamValid = paramId && !isNaN(paramId) && !isNaN(parseFloat(paramId));

    const userId = isParamValid ? Number(paramId) : req.user.id;
    console.log("Fetching profile for userId:", userId);
    if (!userId)
        return res.status(404).json({ message: "Not found" })
    try {
        const user = await conn.all(`SELECT u.name as username,u.created_at AS joined, (SELECT COUNT(*) FROM questions WHERE createdBy=u.id) AS questions, (SELECT COUNT(*) FROM solutions WHERE created_by=u.id) AS solutions, u.points, u.email, u.profile_pic, ub.rewarded_at, b.name as badgeName, b.description, b.icon FROM users u Full JOIN user_badges ub ON ub.user_id=u.id full JOIN badges b ON b.id=ub.badge_id WHERE u.id=?;
`, [userId])
        console.log(user)
        const {
            username,
            joined,
            questions,
            solutions,
            points,
            email,
            profile_pic,
        } = user[0];

        const result = {
            username,
            joined,
            questions,
            solutions,
            points,
            email,
            profile_pic,
            badges: user.map(
                ({ badgeName, rewarded_at, description, icon }) => ({
                    name: badgeName,
                    rewarded_at,
                    description,
                    icon,
                })
            ),
        };
        res.status(200).send(result);
    } catch (e) {
        return res.status(500).json({ message: e.message })
    }
}

const getActivityLogs = async (req, res) => {
    const userId = req.user.id;
    try {
        const logs = await conn.all(`SELECT * FROM activity WHERE created_by = ? ORDER BY created_at DESC`, [userId]);
        res.status(200).json(logs);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
};

module.exports = { registrationService, loginService, updateProfilePic, getAllUsers, logoutService, getProfile, getActivityLogs };

