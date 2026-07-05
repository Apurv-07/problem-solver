const { open } = require('sqlite');
const sqlite3 = require("sqlite3");
const path = require("path");

const dbPath =
    process.env.WEBSITE_INSTANCE_ID
        ? path.join(process.env.HOME, "site", "data", "database.db")
        : path.join(__dirname, "database.db");

let conn = null;

const dbrun = async () => {
    conn = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });
};


const getAnswersByQuestionId = async (req, res) => {
    const qId = req.params.id;
    if (!qId)
        return res.status(404).json({ message: "Not found" })
    try {
        const answers = await conn.all(`SELECT * FROM solutions s JOIN users u ON u.id=s.created_by WHERE parentId=?`, [qId])
        res.status(200).send(answers);
    } catch (e) {
        return res.status(500).json({ message: e.message })
    }
}

const getMyAnswered = async (req, res) => {
    const id = req.user.id;
    const { category, difficulty } = req.query;
    let dbQuery = 'SELECT q.id as quid, u.name, q.question, q.difficulty, q.category, s.id as sid, s.answer FROM solutions s JOIN questions q ON s.parentId=q.id JOIN users u ON u.id=q.createdBy WHERE s.created_by = ?';
    const params = [id]; // Start with the mandatory ID

    if (category) {
        dbQuery += ' AND q.category = ?';
        params.push(category);
    }

    if (difficulty) {
        dbQuery += ' AND q.difficulty = ?';
        params.push(difficulty);
    }

    try {
        const question = await conn.all(dbQuery, params); // Use the dynamic array
        if(question)
            res.status(200).json(question);
        else
            res.status(404).json("Nothing found");
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

const createAnswer = async (req, res) => {
    const userId = req.user.id;
    const { answer, parentId } = req.body;
    let diff = req.body.difficulty.toLowerCase();
    let points = 2;
    if (diff == 'medium')
        points = 3;
    if (diff == 'hard')
        points = 5;
    if (!userId || !answer || !parentId) {
        return res.status(400).send("All fields are required");
    }
    try {
        await conn.run('INSERT INTO solutions (answer, parentId, created_by) VALUES (?, ?, ?)', [answer, parentId, userId]);
        const updatedUser = await conn.get(
            'UPDATE users SET points = points + ? WHERE id = ? RETURNING points',
            [points, userId]
        );
        const badge = await conn.get(`SELECT * FROM badges WHERE required_points<? ORDER BY required_points DESC LIMIT 1;`, [updatedUser.points]);
        console.log("kkkk", badge);
        await conn.run('INSERT INTO activity(created_by, action_performed) VALUES (?, ?)', [userId, `Answered a ${diff} question and earned ${points} points`]);
        try {
            await conn.run('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)', [userId, badge.id]);
            await conn.run('INSERT INTO activity(created_by, action_performed) VALUES (?, ?)', [userId, `Earned the ${badge.name} badge for creating an answer`]);
        }catch (e) {
            console.log("Badge already exists for user:", e.message);
        }
        res.status(201).json({message:"Answer created successfully"});
    } catch (error) {
        console.error("Error creating answer:", error);
        res.status(500).json({message:"Error creating answer"});
    }
}

module.exports = { createAnswer, getAnswersByQuestionId, getMyAnswered }