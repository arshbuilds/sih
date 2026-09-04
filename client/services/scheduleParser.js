import * as XLSX from "xlsx";

/**
 * Normalizes string values, converting empty/whitespace-only values to null.
 */
function normalizeString(val) {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  return str.length === 0 ? null : str;
}

/**
 * Parses a date value into a JavaScript Date object or null.
 */
function parseDate(val) {
  if (val === undefined || val === null || val === "") return null;
  if (val instanceof Date) {
    return isNaN(val.getTime()) ? null : val;
  }
  const parsed = new Date(val);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Retrieves a field value from a row regardless of header casing or delimiter format.
 * (e.g., handles 'activityId', 'Activity ID', 'activity_id', 'ActivityId')
 */
function getFieldValue(row, aliases) {
  const normalizedRowMap = {};
  for (const key of Object.keys(row)) {
    const simplified = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    normalizedRowMap[simplified] = row[key];
  }

  for (const alias of aliases) {
    const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedRowMap[cleanAlias] !== undefined) {
      return normalizedRowMap[cleanAlias];
    }
  }

  return null;
}

/**
 * Parses an uploaded schedule file buffer (.csv, .xlsx, .xls) into normalized activity objects
 * and categorizes rows missing required fields under failed.
 *
 * @param {Buffer} buffer - File buffer
 * @param {string} originalFilename - Original name of uploaded file
 * @returns {{ validRows: Array<Object>, failedRows: Array<Object>, totalRows: number }}
 */
export function parseScheduleFile(buffer, originalFilename) {
  if (!originalFilename) {
    throw new Error("Filename is required for parsing");
  }

  const extensionMatch = originalFilename.match(/\.([a-zA-Z0-9]+)$/);
  const extension = extensionMatch ? `.${extensionMatch[1].toLowerCase()}` : "";
  const allowedExtensions = [".csv", ".xlsx", ".xls"];

  if (!allowedExtensions.includes(extension)) {
    throw new Error(
      `Unsupported file type: ${extension || "unknown"}. Allowed types are: ${allowedExtensions.join(", ")}`
    );
  }

  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { validRows: [], failedRows: [], totalRows: 0 };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

  const validRows = [];
  const failedRows = [];

  let rowNumber = 1; // Header is row 1, data rows start at row 2
  for (const row of rawRows) {
    rowNumber += 1;

    // Check if the entire row is empty
    const nonNullValues = Object.values(row).filter(
      (v) => v !== null && String(v).trim() !== ""
    );
    if (nonNullValues.length === 0) {
      continue;
    }

    const activityId = normalizeString(
      getFieldValue(row, ["activityId", "activity_id", "activity id", "id"])
    );
    const activityName = normalizeString(
      getFieldValue(row, ["activityName", "activity_name", "activity name", "name", "taskName", "task_name"])
    );

    // Validate required fields: activityId and activityName
    if (!activityId || !activityName) {
      const missing = [];
      if (!activityId) missing.push("activityId");
      if (!activityName) missing.push("activityName");

      failedRows.push({
        rowNumber,
        data: row,
        reason: `Missing required field(s): ${missing.join(", ")}`,
      });
      continue;
    }

    validRows.push({
      activityId,
      activityName,
      discipline: normalizeString(getFieldValue(row, ["discipline", "trade", "department"])),
      location: normalizeString(getFieldValue(row, ["location", "area", "zone", "site"])),
      plannedStart: parseDate(getFieldValue(row, ["plannedStart", "planned_start", "planned start", "startDate", "start_date"])),
      plannedEnd: parseDate(getFieldValue(row, ["plannedEnd", "planned_end", "planned end", "endDate", "end_date"])),
      actualStart: parseDate(getFieldValue(row, ["actualStart", "actual_start", "actual start"])),
      actualEnd: parseDate(getFieldValue(row, ["actualEnd", "actual_end", "actual end"])),
    });
  }

  return {
    validRows,
    failedRows,
    totalRows: validRows.length + failedRows.length,
  };
}
