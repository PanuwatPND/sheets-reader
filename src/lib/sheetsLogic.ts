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
});

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
