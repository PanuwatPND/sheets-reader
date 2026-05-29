export type ReadMode = "publicLink" | "serviceAccount";

export type ActionFilter =
  | "This week"
  | "Next week"
  | "Later"
  | "ยังไม่ต้องทำ"
  | "ยกเลิก"
  | "";

export const ACTION_OPTIONS: {
  value: ActionFilter;
  label: string;
  tone: string;
}[] = [
  { value: "This week", label: "This week", tone: "green" },
  { value: "Next week", label: "Next week", tone: "yellow" },
  { value: "Later", label: "Later", tone: "gray" },
  { value: "ยังไม่ต้องทำ", label: "ยังไม่ต้องทำ", tone: "red" },
  { value: "ยกเลิก", label: "ยกเลิก", tone: "cancel" },
  { value: "", label: "ทั้งหมด", tone: "all" },
];

export interface Settings {
  readMode: ReadMode;
  spreadsheetInput: string;
  /** Comma/newline separated tab names, e.g. "FE-tasks, Bugs" */
  sheetTabs: string;
  /** Cell range applied to each tab, e.g. A1:Z2000 */
  cellRange: string;
  /** @deprecated use cellRange — kept for migration */
  range?: string;
  firstRowIsHeader: boolean;
  nameQuery: string;
  nameColumn: number | null;
  showOnlyMatches: boolean;
  actionFilter: ActionFilter;
  /** Status labels hidden from the Kanban board */
  hiddenStatuses: string[];
  showRawTable: boolean;
  titleColumn: number | null;
  statusColumn: number | null;
  assigneeColumn: number | null;
  serviceAccountPath: string;
}

export interface SheetData {
  name: string;
  rows: string[][];
}

export interface MultiFetchResult {
  sheets: SheetData[];
  warnings: string[];
}

export const defaultSettings = (): Settings => ({
  readMode: "publicLink",
  spreadsheetInput: "",
  sheetTabs: "FE-tasks, Bugs",
  cellRange: "A1:Z2000",
  firstRowIsHeader: true,
  nameQuery: "POND",
  nameColumn: null,
  showOnlyMatches: true,
  actionFilter: "This week",
  hiddenStatuses: [],
  showRawTable: false,
  titleColumn: null,
  statusColumn: null,
  assigneeColumn: null,
  serviceAccountPath: "",
});

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function matchesRow(
  row: string[],
  nameQuery: string,
  nameColumn: number | null,
): boolean {
  const q = normalize(nameQuery);
  if (!q) return false;
  const cells =
    nameColumn !== null && nameColumn < row.length ? [row[nameColumn]] : row;
  return cells.some((cell) => normalize(cell).includes(q));
}

export function summaryLine(row: string[], nameColumn: number | null): string {
  if (nameColumn !== null && nameColumn < row.length) {
    const v = row[nameColumn].trim();
    if (v) return v;
  }
  const parts = row.map((c) => c.trim()).filter(Boolean);
  if (parts.length === 0) return "(ว่าง)";
  if (parts.length === 1) return parts[0];
  return parts.join(" · ");
}

export function buildSummaryText(
  rows: string[][],
  settings: Settings,
): string {
  const q = settings.nameQuery.trim();
  if (!q) {
    return "พิมพ์ชื่อที่ต้องการนับในช่องด้านบน แล้วรายการจะอัปเดตทันที";
  }

  const dataRows = settings.firstRowIsHeader ? rows.slice(1) : rows;
  const matched = dataRows.filter((r) =>
    matchesRow(r, settings.nameQuery, settings.nameColumn),
  );
  const rowsToShow = settings.showOnlyMatches ? matched : dataRows;

  if (rowsToShow.length === 0) {
    return settings.showOnlyMatches
      ? `ไม่พบงานที่ตรงกับ "${q}" (ลองเปลี่ยนคอลัมน์ค้นหา หรือปิด "เฉพาะงานที่ตรง")`
      : 'ไม่มีแถวข้อมูล (ลองปิด "แถวแรกเป็นหัวตาราง" ถ้าชีทไม่มีหัว)';
  }

  return rowsToShow
    .map((row) => {
      const bullet = matchesRow(row, settings.nameQuery, settings.nameColumn)
        ? "•"
        : "–";
      return `${bullet} ${summaryLine(row, settings.nameColumn)}`;
    })
    .join("\n");
}

export function buildFullTableText(rows: string[][]): string {
  return rows
    .map((row) =>
      row.map((c) => c.replace(/\t/g, " ")).join("\t"),
    )
    .join("\n");
}

export function columnLabel(
  col: number,
  rows: string[][],
  firstRowIsHeader: boolean,
): string {
  if (firstRowIsHeader && rows[0] && col < rows[0].length) {
    const h = rows[0][col].trim();
    if (h) return h;
  }
  return `คอลัมน์ ${col + 1}`;
}

export function columnCount(rows: string[][]): number {
  return rows.reduce((max, row) => Math.max(max, row.length), 0);
}
