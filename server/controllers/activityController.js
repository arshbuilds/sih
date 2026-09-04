const ScheduleActivity = require("../models/ScheduleActivity");

const createActivity = async (req, res) => {
  try {
    const activity = await ScheduleActivity.create(req.body);
    res.status(201).json(activity);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

const getActivities = async (req, res) => {
  try {
    const activities = await ScheduleActivity.find();
    res.json(activities);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = { createActivity, getActivities };
