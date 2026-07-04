const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
    const authHeaderAuth = req.headers.authorization?.split(' ')[1];
    const authHeaderCookie = req.headers.cookie?.split('=')[1];
    const authHeader = authHeaderAuth || authHeaderCookie; 
    if (!authHeader) {
        return res.status(401).send("Authorization header missing");
    }
    jwt.verify(authHeader, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).send("Invalid token");
        }
        req.user = user;
        next();
    });
}

module.exports = authMiddleware;