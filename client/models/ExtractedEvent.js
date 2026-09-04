import mongoose from "mongoose";

const extractedEventSchema = new mongoose.Schema(
  {
    // AI-generated fields
    rawDescription: {
      type: String,
      required: [true, "rawDescription is required"],
      trim: true
    },
    activityDescription: {
      type: String,
      required: [true, "activityDescription is required"],
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
    eventType: {
      type: String,
      required: [true, "eventType is required"],
      trim: true
    },
    progress: {
      type: Number,
      default: null
    },
    eventDate: {
      type: Date,
      default: null
    },
    extractionConfidence: {
      type: Number,
      default: null
    },

    // System fields
    sourceReportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RawReport",
      required: [true, "sourceReportId is required"],
      index: true
    },
    matchingStatus: {
      type: String,
      enum: ["pending", "matched", "review_required", "unmatched"],
      default: "pending",
      index: true
    },
    matchedActivityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScheduleActivity",
      default: null
    },
    matchConfidence: {
      type: Number,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const ExtractedEvent =
  mongoose.models.ExtractedEvent ||
  mongoose.model("ExtractedEvent", extractedEventSchema);

export default ExtractedEvent;
