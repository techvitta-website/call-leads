import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// Column definitions for the leads-specific export
// ---------------------------------------------------------------------------

const LEAD_COLUMNS: string[] = [
  "Company Name",
  "Contact Name",
  "Email",
  "Phone",
  "Status",
  "Value (₹)",
  "Priority",
  "Industry",
  "Software Category",
  "Source",
  "City",
  "Country",
  "Assigned To",
  "Created Date",
  "Notes",
];

// Map from the display column header to the lead object field key
const LEAD_FIELD_MAP: Record<string, string> = {
  "Company Name": "company_name",
  "Contact Name": "contact_name",
  "Email": "email",
  "Phone": "phone",
  "Status": "status",
  "Value (₹)": "value",
  "Priority": "priority",
  "Industry": "industry",
  "Software Category": "product_group",
  "Source": "lead_source",
  "City": "city",
  "Country": "country",
  "Assigned To": "assigned_to",
  "Created Date": "created_at",
  "Notes": "lead_notes",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Formats a raw cell value for display in Excel.
 * Dates are converted to a readable locale string; everything else is
 * coerced to string, with null / undefined rendered as an empty string.
 */
function formatValue(value: unknown): string | number {
  if (value === null || value === undefined) return "";

  // Numeric values stay numeric so Excel can format / sum them
  if (typeof value === "number") return value;

  // ISO date strings → locale date
  if (typeof value === "string") {
    const iso = /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value);
    if (iso) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
      }
    }
    return value;
  }

  if (typeof value === "boolean") return value ? "Yes" : "No";

  return String(value);
}

/**
 * Applies basic styling to the header row and auto-fits column widths.
 */
function applyStyles(
  ws: XLSX.WorkSheet,
  headers: string[],
  rowCount: number,
): void {
  // Set column widths based on header length (minimum 12 chars)
  ws["!cols"] = headers.map((h) => ({
    wch: Math.max(h.length + 4, 12),
  }));

  // Freeze the top header row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };

  // Bold + background for header cells (A1 … last header cell)
  const endCol = XLSX.utils.encode_col(headers.length - 1);
  ws["!autofilter"] = { ref: `A1:${endCol}${rowCount + 1}` };

  for (let c = 0; c < headers.length; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[cellRef]) continue;
    ws[cellRef].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1D4ED8" }, patternType: "solid" },
      alignment: { horizontal: "center", vertical: "center", wrapText: false },
      border: {
        bottom: { style: "thin", color: { rgb: "93C5FD" } },
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Exports an array of lead objects to a formatted Excel (.xlsx) file and
 * triggers a browser download.
 *
 * @param leads    Array of lead objects (fields may be in any shape).
 * @param filename Optional filename without extension. Defaults to
 *                 "leads_export_<YYYY-MM-DD>".
 */
export function exportLeadsToExcel(leads: any[], filename?: string): void {
  const today = new Date().toISOString().split("T")[0];
  const safeFilename = (filename ?? `leads_export_${today}`).replace(
    /\.xlsx$/i,
    "",
  );

  // Build rows: each row is an ordered array matching LEAD_COLUMNS
  const rows: (string | number)[][] = leads.map((lead) =>
    LEAD_COLUMNS.map((col) => {
      const field = LEAD_FIELD_MAP[col];
      return formatValue(field ? lead[field] : "");
    }),
  );

  // Prepend headers
  const sheetData: (string | number)[][] = [LEAD_COLUMNS, ...rows];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  applyStyles(ws, LEAD_COLUMNS, rows.length);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");

  // Add a metadata sheet
  const metaData = [
    ["Export Information"],
    ["Generated On", new Date().toLocaleString("en-IN")],
    ["Total Records", leads.length],
    ["Columns Exported", LEAD_COLUMNS.length],
  ];
  const metaWs = XLSX.utils.aoa_to_sheet(metaData);
  metaWs["!cols"] = [{ wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, metaWs, "Info");

  XLSX.writeFile(wb, `${safeFilename}.xlsx`);
}

/**
 * Generic Excel export — converts an arbitrary array of objects to a
 * spreadsheet using the provided column headers as both the header row and
 * the field keys to read from each object.
 *
 * @param data     Array of plain objects.
 * @param columns  Column headers; each header is also used as the key when
 *                 reading from `data` elements (case-sensitive).
 * @param filename Filename including or excluding the .xlsx extension.
 */
export function exportToExcel(
  data: any[],
  columns: string[],
  filename: string,
): void {
  const safeFilename = filename.replace(/\.xlsx$/i, "");

  const rows: (string | number)[][] = data.map((item) =>
    columns.map((col) => formatValue(item[col])),
  );

  const sheetData: (string | number)[][] = [columns, ...rows];

  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  applyStyles(ws, columns, rows.length);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Data");

  XLSX.writeFile(wb, `${safeFilename}.xlsx`);
}
