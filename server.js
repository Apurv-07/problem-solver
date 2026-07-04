const exp=require("express");
const app=exp();
const dotenv=require("dotenv");
const cors=require("cors");
dotenv.config();

const port=process.env.PORT || 3000;

const bodyParser=require("body-parser");
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({
    origin: [
        "http://localhost:5173", // Default Vite local port
        "https://windows.net" // Your Azure Blob URL
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));


const userRoutes=require("./routes/userRoutes");
const questionRoutes=require("./routes/questionRoutes");
const solRoutes=require("./routes/answerRoutes");

app.use("/user", userRoutes);
app.use("/question", questionRoutes);
app.use("/answers", solRoutes)

app.listen(port,()=>{
    console.log(`Server is running on port ${port}`);
});