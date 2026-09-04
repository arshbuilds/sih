const express = require("express");
const router = express.Router();

const upload = require("../config/upload");

const {
  importSchedule
} = require("../controllers/scheduleController");

router.post(
  "/import",
  upload.single("schedule"),
  importSchedule
);

module.exports = router;