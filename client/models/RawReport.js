import mongoose from "mongoose";

const rawReportSchema = new mongoose.Schema(
  {
    reportText: {
      type: String,
      required: [true, "reportText is required"],
      trim: true
    },
    source: {
      type: String,
      required: [true, "source is required"],
      trim: true
    },
    reportDate: {
      type: Date,
      default: null
    },
    discipline: {
      type: String,
      trim: true,
      default: null
    },
    metadata: {
      fileName: {
        type: String,
        default: null,
        trim: true
      },
      originalFormat: {
        type: String,
        default: null,
        trim: true
      }
    },
    processingStatus: {
      type: String,
      enum: ["pending", "processing", "extracted", "failed"],
      default: "pending",
      index: true
    }
  },
  {
    timestamps: true
  }
);

const RawReport =
  mongoose.models.RawReport ||
  mongoose.model("RawReport", rawReportSchema);

export default RawReport;
