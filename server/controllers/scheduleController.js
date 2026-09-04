const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const XLSX = require("xlsx");

const ScheduleActivity =
  require("../models/ScheduleActivity");

const importSchedule = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded"
      });
    }

    const filePath = req.file.path;
    const extension =
      path.extname(req.file.originalname).toLowerCase();

    let activities = [];

    // CSV
    if (extension === ".csv") {
      activities = await new Promise((resolve, reject) => {
        const rows = [];

        fs.createReadStream(filePath)
          .pipe(csv())
          .on("data", (row) => {
            rows.push(row);
          })
          .on("end", () => {
            resolve(rows);
          })
          .on("error", reject);
      });
    }

    // Excel
    if (extension === ".xlsx" || extension === ".xls") {
      const workbook =
        XLSX.readFile(filePath);

      const sheetName =
        workbook.SheetNames[0];

      const worksheet =
        workbook.Sheets[sheetName];

      activities =
        XLSX.utils.sheet_to_json(worksheet);
    }

    const formattedActivities =
      activities.map((activity) => ({
        activityId: activity.activityId,
        activityName: activity.activityName,
        discipline: activity.discipline,
        location: activity.location,
        plannedStart: activity.plannedStart
          ? new Date(activity.plannedStart)
          : null,
        plannedEnd: activity.plannedEnd
          ? new Date(activity.plannedEnd)
          : null
      }));

    const result =
      await ScheduleActivity.insertMany(
        formattedActivities,
        {
          ordered: false
        }
      );

    // Delete temporary file
    fs.unlinkSync(filePath);

    res.status(201).json({
      success: true,
      message: "Schedule imported successfully",
      imported: result.length,
      activities: result
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  importSchedule
};