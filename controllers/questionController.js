const { open } = require('sqlite');
const sqlite3 = require("sqlite3");
const path = require("path");

const dbPath = path.join(__dirname, "database.db");

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


const getAllQuestions = async (req, res) => {
    const { popular, difficulty, search, category } = req.query;
    console.log("Query parameters:", req.query);
    let dbQuery;
    let whereClause = "";
    if (difficulty) {
        whereClause = `WHERE q.difficulty = '${difficulty.toLowerCase()}'`;
    }
    if (category) {
        whereClause = whereClause ? `${whereClause} AND q.category = '${category}'` : `WHERE q.category = '${category}'`;
    }
    if (search) {
        if (whereClause) {
            whereClause += ` AND q.question LIKE '%${search}%'`;
        } else {
            whereClause = `WHERE q.question LIKE '%${search}%'`;
        }
    }
    if (popular == 'true') {
        dbQuery = "SELECT u.name, q.category, q.id AS quid, s.id, COUNT(answer), q.difficulty, question FROM questions q FULL JOIN solutions s ON s.parentId=q.id JOIN users u ON q.createdBy=u.id " + whereClause + " GROUP BY q.id ORDER BY COUNT(answer) DESC";
    } else {
        dbQuery = "SELECT u.name, q.category, q.id AS quid, q.difficulty, question FROM questions q JOIN users u ON q.createdBy=u.id " + whereClause;
    }
    console.log("Database query:", dbQuery);
    try {
        const questions = await conn.all(dbQuery);
        res.status(200).send(questions);
    } catch (e) {
        res.status(500).send(e.message);
    }
}

const getQuestionsById = async (req, res) => {
    const { id } = req.params;
    console.log("Fetching question with ID:", id);
    try {
        const question = await conn.all(`SELECT 
        q.id AS qid, 
        q.createdBy,
        q.question, 
        u.name AS username, 
        u2.name AS answeredBy, 
        q.difficulty, 
        q.category, 
        s.answer 
        FROM questions q 
        JOIN users u ON u.id = q.createdBy 
        LEFT JOIN solutions s ON q.id = s.parentId 
        LEFT JOIN users u2 ON u2.id = s.created_by 
        WHERE q.id = ?`, [id]);
        if (!question) {
            return res.status(404).send("Question not found");
        }
        let p = question.map((i) => {
            return {
                author: i.answeredBy,
                answer: i.answer
            }
        })

        let data = {
            "qid": question[0].qid,
            "userid": question[0].createdBy,
            "question": question[0].question,
            "username": question[0].username,
            "difficulty": question[0].difficulty,
            "category": question[0].category,
            "answers": p
        }
        res.status(200).json(data);
    } catch (e) {
        return res.status(500).send("Error fetching question");
    }
}

const createQuestion = async (req, res) => {
    const id = req.user.id;
    let { question, difficulty, category } = req.body;
    difficulty = difficulty.toLowerCase();
    if (!question || !category) {
        return res.status(400).send("Question and category are required");
    }

    try {
        await conn.run('INSERT INTO questions (question, difficulty, category, createdBy) VALUES (?, ?, ?, ?)', [question, difficulty, category, id]);
        let points = 5;
        if (difficulty == 'medium')
            points = 8;
        if (difficulty == 'hard')
            points = 10;
        const updatedUser = await conn.get(
            'UPDATE users SET points = points + ? WHERE id = ? RETURNING points',
            [points, id]
        );
        const badge = await conn.get(`SELECT * FROM badges WHERE required_points<? ORDER BY required_points DESC LIMIT 1;`, [updatedUser.points]);
        console.log("kkkk", badge);
        await conn.run('INSERT INTO activity(created_by, action_performed) VALUES (?, ?)', [id, `Posted a ${difficulty} question and earned ${points} points`]);
        try {
            await conn.run('INSERT INTO user_badges (user_id, badge_id) VALUES (?, ?)', [id, badge.id]);
            await conn.run('INSERT INTO activity(created_by, action_performed) VALUES (?, ?)', [id, `Earned the ${badge.name} badge for posting a question`]);
        } catch (e) {
            console.log("Badge already exists for user:", e.message);
        }
        return res.status(201).json({ message: "Question created successfully" });
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }
}

const getRandomQuestion = async (req, res) => {
    const { category, difficulty } = req.query;
    let dbQuery = 'SELECT * FROM questions';
    const params = [];
    try {
        if (category) {
            dbQuery += ' WHERE category = ?';
            params.push(category);
        }
        if (difficulty) {
            dbQuery += (category ? ' AND' : ' WHERE') + ' difficulty = ?';
            params.push(difficulty);
        }
        dbQuery += ' ORDER BY RANDOM() LIMIT 1';
        const question = await conn.get(dbQuery, params);
        if (question) {
            res.status(200).json(question);
        } else {
            res.status(200).json({ message: "No data found" })
        }
    } catch (e) {
        res.status(500).send("Error fetching random question");
    }
}

const getRandomFromMyList = async (req, res) => {
    const id = req.user.id;
    const { category, difficulty } = req.query;
    let dbQuery = 'SELECT * FROM solutions s JOIN questions q ON s.parentId=q.id WHERE s.created_by = ?';
    const params = [id]; // Start with the mandatory ID

    if (category) {
        dbQuery += ' AND q.category = ?';
        params.push(category);
    }

    if (difficulty) {
        dbQuery += ' AND q.difficulty = ?';
        params.push(difficulty);
    }

    // Add the final ordering and limit
    dbQuery += ' ORDER BY RANDOM() LIMIT 1';

    try {
        console.log("Data", dbQuery)

        const question = await conn.get(dbQuery, params); // Use the dynamic array
        if (question) {
            res.status(200).json(question);
        } else {
            res.status(200).json({ message: "No data found" })
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

const getMyQuestions = async (req, res) => {
    const id = req.user.id;
    const { category, difficulty } = req.query;
    let dbQuery = 'SELECT q.id, name, question, difficulty, category FROM questions q JOIN users u on createdBy=u.id WHERE createdBy = ?';
    const params = [id];

    if (category) {
        dbQuery += ' AND category = ?';
        params.push(category);
    }

    if (difficulty) {
        dbQuery += ' AND difficulty = ?';
        params.push(difficulty);
    }
    try {
        const questions = await conn.all(dbQuery, params);
        res.status(200).json(questions);
    } catch (e) {
        res.status(500).send("Error fetching your questions");
    }
}

module.exports = {
    getAllQuestions,
    getQuestionsById,
    createQuestion,
    getRandomQuestion,
    getRandomFromMyList,
    getMyQuestions
};