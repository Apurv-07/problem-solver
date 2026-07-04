const express = require('express');
const authMiddleware = require('../middlewares/authMiddleware');
const { createAnswer, getAnswersByQuestionId, getMyAnswered } = require('../controllers/answersController');
const router = express.Router();

router.post("/create", authMiddleware, createAnswer);

router.get("/solByQ/:id", authMiddleware, getAnswersByQuestionId);

router.get("/myAnswered", authMiddleware, getMyAnswered);

module.exports=router;