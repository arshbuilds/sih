import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    extractedEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExtractedEvent",
      required: [true, "extractedEventId is required"],
      index: true
    },
    scheduleActivityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ScheduleActivity",
      required: [true, "scheduleActivityId is required"],
      index: true
    },
    action: {
      type: String,
      required: [true, "action is required"],
      default: "AUTO_UPDATE"
    },
    previousState: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    newState: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    matchConfidence: {
      type: Number,
      required: [true, "matchConfidence is required"]
    },
    details: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

const AuditLog =
  mongoose.models.AuditLog ||
  mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
