const express = require("express");
const { extractReport } = require("../controllers/aiController");

const router = express.Router();

router.post("/extract", extractReport);

module.exports = router;