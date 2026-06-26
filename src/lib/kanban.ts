import type { Settings } from "./sheetsLogic";
import type { ActionFilter } from "./sheetsLogic";
import {
  isRangeAfterWeek,
  nextWorkWeekRange,
  parseDateRangeFromCell,
  rangesOverlap,
  workWeekRange,
  type DateRange,
} from "./weekDates";

export interface ChecklistItem {
  done: boolean;
  text: string;
}

export interface TaskCard {
  id: number;
  /** 1-based row number in the Google Sheet (matches row labels in Sheets). */
  sheetRow: number;
  title: string;
  category: string | null;
  headline: string;
  /** Pre-computed display title — use instead of calling cardDisplayTitle() in templates. */
  displayTitle: string;
  checklist: ChecklistItem[];
  status: string;
  action: string;
  flowId: string;
  taskId: string;
  assignees: string[];
  tags: string[];
  isMatch: boolean;
}

export interface ChipStyle {
  bg: string;
  color: string;
}

export interface KanbanColumn {
  id: string;
  label: string;
  tone: "pink" | "orange" | "green" | "blue" | "gray";
  /** Pre-computed chip style — use instead of calling statusChipStyle() in templates. */
  chipStyle: ChipStyle;
  cards: TaskCard[];
  overflowCount?: number;
}

export interface KanbanResult {
  columns: KanbanColumn[];
  matchCount: number;
}

const MAX_CARDS_PER_COLUMN = 40;

/** Rows with blank Status — work not picked up yet. */
export const EMPTY_STATUS_LABEL = "ยังไม่มีสถานะ";

export interface ColumnMapping {
  titleColumn: number | null;
  statusColumn: number | null;
  assigneeColumn: number | null;
  actionColumn: number | null;
  weekDateColumn: number | null;
  flowIdColumn: number | null;
  idColumn: number | null;
  tagColumns: number[];
}

const STATUS_ORDER = [
  "not started",
  "todo",
  "to do",
  "backlog",
  "in progress",
  "doing",
  "review",
  "complete",
  "completed",
  "done",
];

const STATUS_TONE: Record<string, KanbanColumn["tone"]> = {
  "not started": "pink",
  todo: "pink",
  "to do": "pink",
  backlog: "gray",
  "in progress": "orange",
  doing: "orange",
  review: "blue",
  complete: "green",
  completed: "green",
  done: "green",
};

function norm(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

export function isEmptyStatus(status: string): boolean {
  const s = status.trim();
  if (!s) return true;
  const key = norm(s);
  return (
    key === norm(EMPTY_STATUS_LABEL) ||
    key === "ไม่ระบุ" ||
    key === "unspecified" ||
    key === "unknown"
  );
}

function headerMatches(header: string, patterns: string[]): boolean {
  const h = norm(header);
  return patterns.some((p) => h === p || h.includes(p));
}

export function autoDetectMapping(headers: string[]): ColumnMapping {
  const titlePatterns = [
    "description",
    "title",
    "name",
    "task",
    "summary",
    "bug",
    "งาน",
    "ชื่องาน",
    "feature",
    "detail",
  ];
  const statusPatterns = ["status", "สถานะ", "state", "stage"];
  const assigneePatterns = [
    "assignee",
    "owner",
    "person",
    "assigned",
    "ผู้รับผิดชอบ",
    "responsible",
  ];
  const tagPatterns = ["type", "tag", "sprint", "epic", "label", "category"];

  let titleColumn: number | null = null;
  let statusColumn: number | null = null;
  let assigneeColumn: number | null = null;
  let actionColumn: number | null = null;
  let weekDateColumn: number | null = null;
  let flowIdColumn: number | null = null;
  let idColumn: number | null = null;
  const tagColumns: number[] = [];

  headers.forEach((header, index) => {
    const h = norm(header);
    if (titleColumn === null && headerMatches(header, titlePatterns)) {
      titleColumn = index;
    }
    if (statusColumn === null && headerMatches(header, statusPatterns)) {
      statusColumn = index;
    }
    if (assigneeColumn === null && headerMatches(header, assigneePatterns)) {
      assigneeColumn = index;
    }
    if (actionColumn === null && headerMatches(header, ["action"])) {
      actionColumn = index;
    }
    if (
      weekDateColumn === null &&
      headerMatches(header, [
        "week",
        "date",
        "due",
        "deadline",
        "target",
        "schedule",
        "period",
        "สัปดาห์",
        "วันที่",
      ])
    ) {
      weekDateColumn = index;
    }
    if (flowIdColumn === null && (h === "flow id" || h === "flowid")) {
      flowIdColumn = index;
    }
    if (idColumn === null && h === "id") {
      idColumn = index;
    }
    if (headerMatches(header, tagPatterns)) {
      tagColumns.push(index);
    }
  });

  // "Doing" column — assignee fallback (FE-tasks uses Doing for active owner)
  if (assigneeColumn === null) {
    const doingIdx = headers.findIndex((h) => norm(h) === "doing");
    if (doingIdx >= 0) assigneeColumn = doingIdx;
  }

  if (titleColumn === null && headers.length > 0) {
    titleColumn = headers.findIndex((h) => !headerMatches(h, ["blocked"]));
    if (titleColumn < 0) titleColumn = 0;
  }

  return {
    titleColumn,
    statusColumn,
    assigneeColumn,
    actionColumn,
    weekDateColumn,
    flowIdColumn,
    idColumn,
    tagColumns,
  };
}

function cell(row: string[], col: number | null): string {
  if (col === null || col >= row.length) return "";
  return row[col].trim();
}

function splitPeople(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[,;/|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function isNoise(value: string): boolean {
  const t = norm(value);
  return t === "false" || t === "true" || t === "";
}

function looksLikeDate(value: string): boolean {
  const v = value.trim();
  return (
    /^\d{4}-\d{2}-\d{2}/.test(v) ||
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(v) ||
    /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(v)
  );
}

export interface StatusChipStyle {
  bg: string;
  color: string;
  border?: string;
}

export function statusChipStyle(status: string): StatusChipStyle {
  const key = norm(status);
  if (
    key.includes("done") ||
    key.includes("complete") ||
    key.includes("เสร็จ")
  ) {
    return { bg: "#059669", color: "#fff" };
  }
  if (key.includes("uat")) return { bg: "#d1fae5", color: "#047857" };
  if (key.includes("demo") && (key.includes("ไม่") || key.includes("fail"))) {
    return { bg: "#991b1b", color: "#fff" };
  }
  if (key.includes("brief") || key.includes("req") || key.includes("ไม่ชัด")) {
    return { bg: "#fce7f3", color: "#be185d" };
  }
  if (key.includes("demo") || key.includes("รอ demo")) {
    return { bg: "#fef3c7", color: "#b45309" };
  }
  if (key.includes("cross check") || key.includes("cross")) {
    return { bg: "#f3f4f6", color: "#374151" };
  }
  if (key.includes("อัพ") || key.includes("dev")) {
    return { bg: "#e0f2fe", color: "#0369a1" };
  }
  if (
    key.includes("กำลังทำ") ||
    key.includes("doing") ||
    key.includes("progress")
  ) {
    return { bg: "#dbeafe", color: "#1d4ed8" };
  }
  if (key.includes("block") || key.includes("รอ"))
    return { bg: "#fce7f3", color: "#be185d" };
  if (isEmptyStatus(status)) {
    return { bg: "#f3f4f6", color: "#6b7280", border: "1px dashed #d1d5db" };
  }
  return { bg: "#f3f4f6", color: "#374151" };
}

function statusTone(status: string): KanbanColumn["tone"] {
  const key = norm(status);
  if (STATUS_TONE[key]) return STATUS_TONE[key];
  if (key.includes("done") || key.includes("complete")) return "green";
  if (key.includes("progress") || key.includes("doing") || key.includes("demo"))
    return "orange";
  if (key.includes("block") || key.includes("รอ")) return "pink";
  return "gray";
}

export function isStatusHidden(status: string, hidden: string[]): boolean {
  if (hidden.length === 0) return false;
  const key = norm(status);
  return hidden.some((h) => norm(h) === key);
}

export function toggleStatusHidden(status: string, hidden: string[]): void {
  if (isStatusHidden(status, hidden)) {
    const key = norm(status);
    const idx = hidden.findIndex((h) => norm(h) === key);
    if (idx >= 0) hidden.splice(idx, 1);
  } else {
    hidden.push(status);
  }
}

export function collectAllStatuses(
  rows: string[][],
  settings: Settings,
  mapping: ColumnMapping,
): string[] {
  const dataRows = settings.firstRowIsHeader ? rows.slice(1) : rows;
  const seen = new Set<string>();
  const list: string[] = [];

  for (const row of dataRows) {
    let status: string;
    if (mapping.statusColumn !== null) {
      const raw = cell(row, mapping.statusColumn);
      if (!raw || looksLikeDate(raw)) {
        status = EMPTY_STATUS_LABEL;
      } else {
        status = raw;
      }
    } else {
      status = pickStatus(row, mapping);
    }
    if (!looksLikeStatus(status) && !isEmptyStatus(status)) continue;
    const key = norm(status);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(status);
  }

  return list.sort((a, b) => statusSortKey(a) - statusSortKey(b));
}

export function collectStatuses(
  rows: string[][],
  settings: Settings,
  mapping: ColumnMapping,
): string[] {
  const dataRows = settings.firstRowIsHeader ? rows.slice(1) : rows;
  const seen = new Set<string>();
  const list: string[] = [];

  for (const row of dataRows) {
    if (settings.showOnlyMatches) {
      if (
        !matchesTask(
          row,
          settings.nameQuery,
          mapping,
          settings.nameColumn,
          settings.includeSharedAssignees,
        )
      ) {
        continue;
      }
    }
    if (!matchesAction(row, mapping, settings.actionFilter)) continue;

    const status = pickStatus(row, mapping);
    const key = norm(status);
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(status);
  }

  return list.sort((a, b) => statusSortKey(a) - statusSortKey(b));
}

function isUnspecifiedStatus(status: string): boolean {
  return isEmptyStatus(status);
}

function statusSortKey(status: string): number {
  if (isUnspecifiedStatus(status)) return -1;
  const num = status.trim().match(/^(\d+)/);
  if (num) return parseInt(num[1], 10);
  const key = norm(status);
  const idx = STATUS_ORDER.indexOf(key);
  return idx >= 0 ? idx : 200 + key.charCodeAt(0);
}

function isStatusLike(value: string): boolean {
  const v = value.trim();
  if (/^\d+\s*-/.test(v)) return true;
  const n = norm(v);
  if (n === "done" || n === "complete" || n === "completed") return true;
  return false;
}

function pickTitle(row: string[], mapping: ColumnMapping): string | null {
  const skip = new Set(
    [
      mapping.statusColumn,
      mapping.actionColumn,
      mapping.assigneeColumn,
      mapping.flowIdColumn,
      mapping.idColumn,
      ...mapping.tagColumns,
    ].filter((c): c is number => c !== null),
  );

  let title = cell(row, mapping.titleColumn);
  if (title && !isNoise(title) && !isStatusLike(title)) return title;

  const candidates = row
    .map((c) => c.trim())
    .filter(
      (v, i) =>
        !skip.has(i) &&
        v.length > 4 &&
        !isNoise(v) &&
        !looksLikeDate(v) &&
        !isStatusLike(v),
    );
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.length - a.length)[0];
}

/** Split sheet description into headline + checklist items. */
export function parseCardContent(raw: string): {
  category: string | null;
  headline: string;
  checklist: ChecklistItem[];
} {
  let text = raw.trim();
  let category: string | null = null;

  const catMatch = text.match(/^\[([^\]]+)\]/);
  if (catMatch) {
    category = catMatch[1];
    text = text.slice(catMatch[0].length).trim();
  }

  const segments = text.split(/\s+-\s+(?=\[[Xx\s]\])/);
  const headline = segments[0]?.trim() || text;
  const checklist = segments
    .slice(1)
    .map((seg) => {
      const m = seg.match(/^\[([Xx\s])\]\s*(.*)$/);
      if (m) {
        return { done: m[1].toLowerCase() === "x", text: m[2].trim() };
      }
      return { done: false, text: seg.replace(/^\[[Xx\s]\]\s*/, "").trim() };
    })
    .filter((item) => item.text.length > 0);

  return { category, headline, checklist };
}

/** Text shown on the card — prefers parsed headline, falls back to raw title. */
export function cardDisplayTitle(card: TaskCard): string {
  if (card.headline.trim()) return card.headline;
  if (card.category) return card.category;
  if (card.title.trim() && norm(card.title) !== norm(card.status)) {
    return card.title.trim();
  }
  if (card.checklist.length > 0) {
    return card.checklist[0].text;
  }
  return "";
}

function dedupeTags(tags: string[], action: string): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    if (action && norm(tag) === norm(action)) return false;
    const key = norm(tag);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function looksLikeStatus(value: string): boolean {
  const v = value.trim();
  if (!v || looksLikeDate(v)) return false;
  // "1 - กำลังทำ", "2.5 - รอ Cross Check", "6 - Done"
  if (/^\d+(\.\d+)?\s*-\s*.+/.test(v)) return true;
  if (v.length > 48) return false;
  // Task titles / descriptions — not status labels
  if (/[>_/]{1,}/.test(v) && v.length > 20) return false;
  const key = norm(v);
  if (isEmptyStatus(v)) return true;
  if (/^(done|complete|completed|todo|backlog|in progress)$/i.test(key)) {
    return true;
  }
  return isStatusLike(v);
}

function pickStatus(row: string[], mapping: ColumnMapping): string {
  if (mapping.statusColumn !== null) {
    const fromCol = cell(row, mapping.statusColumn);
    if (fromCol && !looksLikeDate(fromCol)) return fromCol;
    return EMPTY_STATUS_LABEL;
  }

  for (const value of row) {
    const v = value.trim();
    if (!v || looksLikeDate(v) || isNoise(v)) continue;
    if (looksLikeStatus(v)) return v;
  }
  return EMPTY_STATUS_LABEL;
}

/** Match by assignee column — supports multiple names in one cell. */
export function matchesTask(
  row: string[],
  nameQuery: string,
  mapping: ColumnMapping,
  nameColumn: number | null,
  includeSharedAssignees: boolean,
): boolean {
  const q = norm(nameQuery);
  if (!q) return false;

  const assignees = assigneesForRow(row, mapping, nameColumn);
  if (assignees.length > 0) {
    const hasName = assignees.some((a) => norm(a).includes(q));
    if (!hasName) return false;
    if (!includeSharedAssignees) {
      return assignees.length === 1;
    }
    return true;
  }

  if (nameColumn !== null && nameColumn < row.length) {
    return norm(row[nameColumn]).includes(q);
  }

  if (mapping.assigneeColumn !== null && mapping.assigneeColumn < row.length) {
    return norm(row[mapping.assigneeColumn]).includes(q);
  }

  return false;
}

function assigneesForRow(
  row: string[],
  mapping: ColumnMapping,
  nameColumn: number | null,
): string[] {
  if (nameColumn !== null && nameColumn < row.length) {
    return splitPeople(row[nameColumn]);
  }
  if (mapping.assigneeColumn !== null && mapping.assigneeColumn < row.length) {
    return splitPeople(row[mapping.assigneeColumn]);
  }
  return [];
}

function getRowDateRange(
  row: string[],
  mapping: ColumnMapping,
  now = new Date(),
): DateRange | null {
  if (mapping.weekDateColumn !== null) {
    const fromCol = cell(row, mapping.weekDateColumn);
    const parsed = parseDateRangeFromCell(fromCol, now);
    if (parsed) return parsed;
  }

  const skip = new Set(
    [
      mapping.titleColumn,
      mapping.statusColumn,
      mapping.assigneeColumn,
      mapping.actionColumn,
      mapping.flowIdColumn,
      mapping.idColumn,
      ...mapping.tagColumns,
    ].filter((c): c is number => c !== null),
  );

  for (let col = 0; col < row.length; col++) {
    if (skip.has(col)) continue;
    const v = row[col]?.trim() ?? "";
    if (!v || v.length > 48) continue;
    const parsed = parseDateRangeFromCell(v, now);
    if (parsed) return parsed;
  }

  return null;
}

export function matchesAction(
  row: string[],
  mapping: ColumnMapping,
  actionFilter: ActionFilter,
  now = new Date(),
): boolean {
  if (!actionFilter) return true;

  const actionValue =
    mapping.actionColumn !== null ? cell(row, mapping.actionColumn) : "";
  const normAction = norm(actionValue);

  if (actionFilter === "This week") {
    // Explicit action text wins over date range (deadline may fall outside work week)
    if (normAction === "this week") return true;
    const rowRange = getRowDateRange(row, mapping, now);
    if (rowRange) return rangesOverlap(rowRange, workWeekRange(now));
    return false;
  }

  if (actionFilter === "Next week") {
    if (normAction === "next week") return true;
    const rowRange = getRowDateRange(row, mapping, now);
    if (rowRange) return rangesOverlap(rowRange, nextWorkWeekRange(now));
    return false;
  }

  if (actionFilter === "Later") {
    if (normAction === "later") return true;
    const rowRange = getRowDateRange(row, mapping, now);
    if (rowRange) return isRangeAfterWeek(rowRange, nextWorkWeekRange(now));
    return false;
  }

  if (mapping.actionColumn === null) return true;
  return norm(actionValue) === norm(actionFilter);
}

function rowVisible(
  row: string[],
  settings: Settings,
  mapping: ColumnMapping,
): boolean {
  if (settings.showOnlyMatches) {
    if (
      !matchesTask(
        row,
        settings.nameQuery,
        mapping,
        settings.nameColumn,
        settings.includeSharedAssignees,
      )
    ) {
      return false;
    }
  }
  if (!matchesAction(row, mapping, settings.actionFilter)) {
    return false;
  }
  if (isStatusHidden(pickStatus(row, mapping), settings.hiddenStatuses)) {
    return false;
  }
  return true;
}

export function buildKanban(
  rows: string[][],
  settings: Settings,
  mapping: ColumnMapping,
): KanbanResult {
  const dataRows = settings.firstRowIsHeader ? rows.slice(1) : rows;

  const usedCols = new Set([
    mapping.titleColumn,
    mapping.statusColumn,
    mapping.assigneeColumn,
    mapping.actionColumn,
    mapping.weekDateColumn,
    mapping.flowIdColumn,
    mapping.idColumn,
    ...mapping.tagColumns,
  ]);

  const cards: TaskCard[] = dataRows
    .map((row, index) => {
      if (!rowVisible(row, settings, mapping)) return null;

      const title = pickTitle(row, mapping);
      if (!title) return null;

      const { category, headline, checklist } = parseCardContent(title);
      const status = pickStatus(row, mapping);

      if (!headline.trim() && checklist.length === 0) return null;
      if (norm(headline) === norm(status)) return null;

      const action = cell(row, mapping.actionColumn);
      const flowId = cell(row, mapping.flowIdColumn);
      const taskId = cell(row, mapping.idColumn);
      const assignees = splitPeople(cell(row, mapping.assigneeColumn));
      let tags = mapping.tagColumns
        .map((col) => cell(row, col))
        .filter((t) => t && !isNoise(t) && !looksLikeDate(t));

      if (tags.length === 0) {
        row.forEach((value, col) => {
          if (usedCols.has(col)) return;
          const v = value.trim();
          if (v && v.length <= 32 && !isNoise(v) && !looksLikeDate(v)) {
            tags.push(v);
          }
        });
      }
      tags = dedupeTags(tags, action);

      const isMatch = matchesTask(
        row,
        settings.nameQuery,
        mapping,
        settings.nameColumn,
        settings.includeSharedAssignees,
      );
      const card: TaskCard = {
        id: index,
        sheetRow: index + (settings.firstRowIsHeader ? 2 : 1),
        title,
        category,
        headline,
        displayTitle: "",
        checklist,
        status,
        action,
        flowId,
        taskId,
        assignees,
        tags,
        isMatch,
      };
      card.displayTitle = cardDisplayTitle(card);
      return card;
    })
    .filter((c): c is TaskCard => c !== null);

  const groups = new Map<string, TaskCard[]>();
  for (const card of cards) {
    const key = card.status || EMPTY_STATUS_LABEL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(card);
  }

  const allStatuses = collectAllStatuses(rows, settings, mapping);

  const columns = allStatuses
    .filter((label) => !isStatusHidden(label, settings.hiddenStatuses))
    .map((label) => {
      const groupCards = groups.get(label) ?? [];
      const ordered = [...groupCards].sort((a, b) => b.sheetRow - a.sheetRow);
      const overflow =
        ordered.length > MAX_CARDS_PER_COLUMN
          ? ordered.length - MAX_CARDS_PER_COLUMN
          : 0;
      const { bg, color } = statusChipStyle(label);
      return {
        id: norm(label).replace(/\s+/g, "-") || "unknown",
        label,
        tone: statusTone(label),
        chipStyle: { bg, color },
        cards: overflow > 0 ? ordered.slice(0, MAX_CARDS_PER_COLUMN) : ordered,
        overflowCount: overflow > 0 ? overflow : undefined,
      };
    });

  return { columns, matchCount: cards.length };
}

export function buildKanbanCopyText(columns: KanbanColumn[]): string {
  if (columns.every((c) => c.cards.length === 0)) {
    return "ไม่มีงานที่จะสรุป";
  }
  return columns
    .filter((col) => col.cards.length > 0)
    .map((col) => {
      const lines = col.cards.map((c) => {
        const sub =
          c.checklist.length > 0
            ? `\n${c.checklist.map((i) => `    ${i.done ? "✓" : "○"} ${i.text}`).join("\n")}`
            : "";
        const tags =
          c.tags.length > 0 ? ` [${c.tags.slice(0, 3).join(", ")}]` : "";
        const refs =
          c.flowId || c.taskId
            ? ` (${[c.flowId && `Flow ${c.flowId}`, c.taskId].filter(Boolean).join(" · ")})`
            : "";
        const head = c.category ? `[${c.category}] ${c.headline}` : c.headline;
        return `  • ${head}${refs}${tags}${sub}`;
      });
      return `${col.label} (${col.cards.length})\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function avatarColor(name: string): string {
  const palette = [
    "#0369a1",
    "#0d9488",
    "#f59e0b",
    "#10b981",
    "#0284c7",
    "#64748b",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}
