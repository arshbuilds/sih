require("dotenv").config();

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const activityRoutes = require("./routes/activityRoutes");
const scheduleRoutes = require("./routes/scheduleRoutes");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running"
  });
});

app.use("/api/activities", activityRoutes);
app.use("/api/schedules", scheduleRoutes);
connectDB();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
