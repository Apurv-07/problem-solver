const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");

const {registrationService, loginService, updateProfilePic, getAllUsers, getProfile, logoutService, getActivityLogs} = require("../controllers/userController");
const profileHandlerMiddleware = require("../middlewares/profileHandlerMiddleware");

router.post("/registration", registrationService);

router.post("/login", loginService);

router.post("/updateProfilePic", authMiddleware, updateProfilePic);

router.get("/allUsers", getAllUsers);

router.get("/get-profile/:id", profileHandlerMiddleware, getProfile);

router.get("/activity-logs", authMiddleware, getActivityLogs)

router.get("/logout", logoutService)

module.exports = router;