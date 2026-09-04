const mongoose = require("mongoose");

const scheduleActivitySchema = new mongoose.Schema(
  {
    activityId: {
      type: String,
      required: true,
      unique: true
    },
    activityName: {
      type: String,
      required: true
    },
    discipline: String,
    location: String,
    plannedStart: Date,
    plannedEnd: Date,
    actualStart: Date,
    actualEnd: Date
  },
  { timestamps: true }
);

module.exports = mongoose.model("ScheduleActivity", scheduleActivitySchema);
