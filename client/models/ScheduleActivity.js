import mongoose from "mongoose";

const scheduleActivitySchema = new mongoose.Schema(
  {
    activityId: {
      type: String,
      required: [true, "activityId is required"],
      unique: true,
      trim: true
    },
    activityName: {
      type: String,
      required: [true, "activityName is required"],
      trim: true
    },
    discipline: {
      type: String,
      trim: true,
      default: null
    },
    location: {
      type: String,
      trim: true,
      default: null
    },
    plannedStart: {
      type: Date,
      default: null
    },
    plannedEnd: {
      type: Date,
      default: null
    },
    actualStart: {
      type: Date,
      default: null
    },
    actualEnd: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const ScheduleActivity =
  mongoose.models.ScheduleActivity ||
  mongoose.model("ScheduleActivity", scheduleActivitySchema);

export default ScheduleActivity;
