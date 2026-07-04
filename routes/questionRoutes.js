const express = require("express");
const { getAllQuestions, getQuestionsById, createQuestion, getRandomQuestion, getRandomFromMyList, getMyQuestions } = require("../controllers/questionController");
const authMiddleware = require("../middlewares/authMiddleware");
const router = express.Router();

router.get("/questions", getAllQuestions);

router.get("/questions/:id", authMiddleware, getQuestionsById);

router.post("/create", authMiddleware, createQuestion);

router.get("/random", authMiddleware, getRandomQuestion);

router.get("/mySolvedRandom", authMiddleware, getRandomFromMyList);

router.get("/myposted", authMiddleware, getMyQuestions);

module.exports = router;

