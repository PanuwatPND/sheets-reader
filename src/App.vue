<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import KanbanBoard from "./components/KanbanBoard.vue";
import SettingsDrawer from "./components/SettingsDrawer.vue";
import ActionFilter from "./components/ActionFilter.vue";
import StatusFilter from "./components/StatusFilter.vue";
import {
  autoDetectMapping,
  buildKanban,
  buildKanbanCopyText,
  isEmptyStatus,
  type ColumnMapping,
} from "./lib/kanban";
import {
  buildFullTableText,
  columnCount,
  columnLabel,
  extractSpreadsheetId,
  type MultiFetchResult,
  type Settings,
  type SheetData,
} from "./lib/sheetsLogic";
import { loadSettings, saveSettings } from "./lib/storage";
const settings = ref<Settings>(loadSettings());
const sheets = ref<SheetData[]>([]);
const fetchWarnings = ref<string[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const copyNotice = ref<string | null>(null);
const statusNotice = ref<string | null>(null);
const showSettings = ref(false);
const activeTab = ref("");

// sheetName → Set of sheetRow for cards that matched user on last fetch
const knownMatchRows = new Map<string, Set<number>>();
let isFirstFetch = true;

function mappingForRows(rows: string[][]): ColumnMapping {
  const headers =
    settings.value.firstRowIsHeader && rows[0] ? rows[0] : [];
  return autoDetectMapping(headers);
}

const referenceRows = computed(
  () => sheets.value.find((s) => s.rows.length > 0)?.rows ?? [],
);

const sheetBoards = computed(() =>
  sheets.value.map((sheet) => {
    const mapping = mappingForRows(sheet.rows);
    const { columns, matchCount } = buildKanban(sheet.rows, settings.value, mapping);
    return { name: sheet.name, mapping, matchCount, columns };
  }),
);

const activeBoard = computed(
  () => sheetBoards.value.find((b) => b.name === activeTab.value) ?? sheetBoards.value[0],
);

const matchCount = computed(() =>
  sheetBoards.value.reduce((n, b) => n + b.matchCount, 0),
);

const cols = computed(() => columnCount(referenceRows.value));

const rawTableText = computed(() =>
  sheets.value
    .map((s) => `=== ${s.name} ===\n${buildFullTableText(s.rows)}`)
    .join("\n\n"),
);

const hasData = computed(() =>
  sheets.value.some((s) => s.rows.length > 0),
);

const spreadsheetId = computed(() =>
  extractSpreadsheetId(settings.value.spreadsheetInput),
);

let refreshTimer: ReturnType<typeof setInterval> | null = null;
const lastRefreshAt = ref(Date.now());
const now = ref(Date.now());
let countdownTimer: ReturnType<typeof setInterval> | null = null;

function markRefreshed() {
  lastRefreshAt.value = Date.now();
}

const refreshCountdown = computed(() => {
  const mins = settings.value.autoRefreshMinutes;
  if (mins <= 0) return null;
  const remainingMs = mins * 60 * 1000 - (now.value - lastRefreshAt.value);
  const sec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
});

function resetRefreshTimer() {
  if (refreshTimer !== null) { clearInterval(refreshTimer); refreshTimer = null; }
  const mins = settings.value.autoRefreshMinutes;
  if (mins > 0) {
    refreshTimer = setInterval(() => fetchData(), mins * 60 * 1000);
  }
}

const trayCounts = computed(() => {
  if (!settings.value.nameQuery.trim()) return null;
  let notStarted = 0, inProgress = 0, waiting = 0, done = 0;
  for (const board of sheetBoards.value) {
    for (const col of board.columns) {
      const n = col.cards.filter((c) => c.isMatch).length;
      const label = col.label.trim();
      const lo = label.toLowerCase();
      if (isEmptyStatus(label)) notStarted += n;
      else if (label.includes("กำลังทำ")) inProgress += n;
      else if (lo.includes("รอ demo") || label.includes("รอเดโม")) waiting += n;
      else if (lo.includes("done") || col.tone === "green") done += n;
    }
  }
  if (notStarted + inProgress + waiting + done === 0) return null;
  return { notStarted, inProgress, waiting, done };
});

function renderTrayRgba(ns: number, ip: number, wt: number, done: number): { rgba: number[]; width: number; height: number } | null {
  const scale = 2;
  const H = 26; // 22px numbers + 2px gap + 2px bar
  const m = document.createElement("canvas").getContext("2d")!;
  m.font = "bold 14px -apple-system";
  const bigW = Math.ceil(m.measureText(String(ns)).width);
  m.font = "bold 9px -apple-system";
  const smallW = Math.ceil(Math.max(m.measureText(String(ip)).width, m.measureText(String(wt)).width));
  const divX = bigW + 4;
  const smallX = divX + 4;
  const W = smallX + smallW + 1;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.scale(scale, scale);
  // Numbers
  ctx.fillStyle = "white";
  ctx.font = "bold 14px -apple-system";
  ctx.textBaseline = "middle";
  ctx.fillText(String(ns), 1, 11);
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.fillRect(divX, 3, 1, 16);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "bold 9px -apple-system";
  ctx.textBaseline = "middle";
  ctx.fillText(String(ip), smallX, 7);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = "9px -apple-system";
  ctx.textBaseline = "middle";
  ctx.fillText(String(wt), smallX, 15);
  // Progress bar
  const total = ns + ip + wt + done;
  const barY = 23;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.roundRect(0, barY, W, 2, 1);
  ctx.fill();
  if (total > 0 && done > 0) {
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.beginPath();
    ctx.roundRect(0, barY, W * (done / total), 2, 1);
    ctx.fill();
  }
  const d = ctx.getImageData(0, 0, W * scale, H * scale);
  return { rgba: Array.from(d.data), width: W * scale, height: H * scale };
}

watch([trayCounts, () => settings.value.trayDisplay], ([counts, display]) => {
  if (display === "icon" || !counts) {
    invoke("set_tray_icon_data", { rgba: null, width: 0, height: 0 });
    return;
  }
  const r = renderTrayRgba(counts.notStarted, counts.inProgress, counts.waiting, counts.done);
  if (r) invoke("set_tray_icon_data", r);
});

watch(() => settings.value.autoRefreshMinutes, resetRefreshTimer);
onUnmounted(() => {
  if (refreshTimer !== null) clearInterval(refreshTimer);
  if (countdownTimer !== null) clearInterval(countdownTimer);
});

let saveTimer: ReturnType<typeof setTimeout> | null = null;
watch(settings, (s) => {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveSettings(s), 300);
}, { deep: true });
onUnmounted(() => { if (saveTimer !== null) clearTimeout(saveTimer); });

watch(sheetBoards, (boards) => {
  if (boards.length === 0) return;
  if (!boards.some((b) => b.name === activeTab.value)) {
    activeTab.value = boards[0].name;
  }
});

onMounted(async () => {
  countdownTimer = setInterval(() => {
    now.value = Date.now();
  }, 1000);

  if (settings.value.spreadsheetInput.trim()) {
    await fetchData();
  } else {
    showSettings.value = true;
  }
  resetRefreshTimer();
  const unlisten = await listen("tray-refresh", () => fetchData());
  onUnmounted(unlisten);
});

async function fetchData() {
  error.value = null;
  fetchWarnings.value = [];
  loading.value = true;
  try {
    const result = await invoke<MultiFetchResult>("fetch_sheets", {
      spreadsheetInput: settings.value.spreadsheetInput,
      sheetTabs: settings.value.sheetTabs,
    });
    sheets.value = result.sheets;
    fetchWarnings.value = result.warnings;
    if (!hasData.value) {
      error.value = "ไม่พบข้อมูลในแท็บที่เลือก";
    } else {
      const tabNames = sheets.value.map((s) => s.name);
      if (!activeTab.value || !tabNames.includes(activeTab.value)) {
        activeTab.value = sheets.value[0]?.name ?? "";
      }
      showSettings.value = false;
    }
    if (
      settings.value.nameColumn !== null &&
      settings.value.nameColumn >= cols.value
    ) {
      settings.value.nameColumn = null;
    }
    if (isFirstFetch) {
      // Seed known rows without notifying
      for (const board of sheetBoards.value) {
        const rows = new Set<number>();
        for (const col of board.columns) {
          for (const card of col.cards) {
            if (card.isMatch) rows.add(card.sheetRow);
          }
        }
        knownMatchRows.set(board.name, rows);
      }
      isFirstFetch = false;
    } else if (settings.value.nameQuery.trim()) {
      checkForNewTasks();
    }
  } catch (e) {
    sheets.value = [];
    error.value = String(e);
  } finally {
    loading.value = false;
    markRefreshed();
  }
}

function notifLine(displayTitle: string, sheetName: string): string {
  const isBug = sheetName.toLowerCase().includes("bug");
  const icon = isBug ? "※ " : "✧";
  // "TASK" renders wider than "BUG" in proportional font — pad BUG more to align ·
  const label = isBug ? "BUG  " : "TASK";
  return `${icon} ${label}  ·  ${displayTitle || "งานใหม่"}`;
}

function checkForNewTasks() {
  const newCards: { displayTitle: string; sheetName: string }[] = [];

  for (const board of sheetBoards.value) {
    const known = knownMatchRows.get(board.name) ?? new Set<number>();
    const current = new Set<number>();

    for (const col of board.columns) {
      for (const card of col.cards) {
        if (!card.isMatch) continue;
        current.add(card.sheetRow);
        if (!known.has(card.sheetRow)) {
          newCards.push({ displayTitle: card.displayTitle, sheetName: board.name });
        }
      }
    }

    knownMatchRows.set(board.name, current);
  }

  if (newCards.length === 0) return;

  const body = newCards.map((c) => notifLine(c.displayTitle, c.sheetName)).join("\n");
  invoke("show_notification", { title: "Sheets Reader", body });
}

function updateLocalCell(
  sheetName: string,
  sheetRow: number,
  column: number,
  value: string,
) {
  const sheet = sheets.value.find((s) => s.name === sheetName);
  if (!sheet) return;
  const rowIndex = sheetRow - (settings.value.firstRowIsHeader ? 2 : 1);
  if (rowIndex < 0 || rowIndex >= sheet.rows.length) return;
  const row = sheet.rows[rowIndex];
  while (row.length <= column) row.push("");
  row[column] = value;
}

const statusWritable = computed(
  () =>
    !!settings.value.serviceAccountPath.trim() &&
    activeBoard.value?.mapping.statusColumn !== null &&
    activeBoard.value?.mapping.statusColumn !== undefined,
);

async function onStatusChange(payload: {
  sheetRow: number;
  fromStatus: string;
  toStatus: string;
}) {
  const board = activeBoard.value;
  const col = board?.mapping.statusColumn;
  const sheetName = activeTab.value;
  if (!board || col === null || col === undefined || !sheetName) return;
  if (payload.fromStatus === payload.toStatus) return;

  const cellValue = isEmptyStatus(payload.toStatus) ? "" : payload.toStatus;
  const prevValue = isEmptyStatus(payload.fromStatus) ? "" : payload.fromStatus;

  updateLocalCell(sheetName, payload.sheetRow, col, cellValue);

  try {
    await invoke("update_sheet_cell", {
      serviceAccountPath: settings.value.serviceAccountPath,
      spreadsheetInput: settings.value.spreadsheetInput,
      sheetName,
      column: col,
      row: payload.sheetRow,
      value: cellValue,
    });
    statusNotice.value = "อัปเดตสถานะแล้ว";
    setTimeout(() => {
      statusNotice.value = null;
    }, 2000);
  } catch (e) {
    updateLocalCell(sheetName, payload.sheetRow, col, prevValue);
    error.value = String(e);
  }
}

function copySummary() {
  const board = activeBoard.value;
  if (!board) return;
  const text = `# ${board.name}\n${buildKanbanCopyText(board.columns)}`;
  navigator.clipboard.writeText(text).then(() => {
    copyNotice.value = "คัดลอกแล้ว";
    setTimeout(() => {
      copyNotice.value = null;
    }, 2000);
  });
}

</script>

<template>
  <div class="app">
    <header class="topbar">
      <div class="topbar-brand">
        <img class="brand-icon" src="/icon.png" alt="" width="36" height="36" />
        <div>
          <h1 class="topbar-title">Sheets Reader</h1>
          <p v-if="settings.nameQuery" class="topbar-sub">
            งานของ <strong>{{ settings.nameQuery }}</strong>
            <span v-if="hasData"> · {{ matchCount }} รายการ</span>
          </p>
        </div>
      </div>

      <div class="topbar-toolbar">
        <div class="filter-group">
          <label class="filter-field">
            <span class="filter-field-icon" aria-hidden="true">👤</span>
            <input
              v-model="settings.nameQuery"
              class="name-input"
              type="text"
              placeholder="Assignee"
              title="กรองตาม Assignee"
            />
          </label>
          <button
            type="button"
            class="mine-toggle"
            :class="{ on: settings.showOnlyMatches }"
            title="แสดงเฉพาะงานของฉัน"
            @click="settings.showOnlyMatches = !settings.showOnlyMatches"
          >
            เฉพาะของฉัน
          </button>
        </div>

        <div class="toolbar-divider" aria-hidden="true" />

        <div class="icon-group">

          <span v-if="loading" class="loading-dot" title="กำลังโหลด…" />
          <span
            v-else-if="refreshCountdown"
            class="refresh-countdown"
            :title="`รีเฟรชอัตโนมัติใน ${refreshCountdown}`"
          >
            {{ refreshCountdown }}
          </span>
          <span v-if="copyNotice" class="notice">{{ copyNotice }}</span>
          <span v-if="statusNotice" class="notice">{{ statusNotice }}</span>
          <button
            type="button"
            class="icon-btn"
            title="รีเฟรช"
            :disabled="loading || !settings.spreadsheetInput.trim()"
            @click="fetchData"
          >
            ↻
          </button>
          <button
            type="button"
            class="icon-btn"
            title="คัดลอกแท็บนี้"
            :disabled="!activeBoard?.columns.length"
            @click="copySummary"
          >
            ⎘
          </button>
          <button
            type="button"
            class="icon-btn gear"
            :class="{ active: showSettings }"
            title="ตั้งค่า"
            @click="showSettings = !showSettings"
          >
            ⚙
          </button>
        </div>
      </div>
    </header>

    <nav v-if="hasData && !settings.showRawTable" class="tab-bar">
      <div class="tab-bar-left">
        <button
          v-for="board in sheetBoards"
          :key="board.name"
          type="button"
          class="tab"
          :class="{ active: activeTab === board.name }"
          @click="activeTab = board.name"
        >
          {{ board.name }}
          <span class="tab-count">{{ board.matchCount }}</span>
        </button>
      </div>

      <div class="tab-bar-filters">
        <StatusFilter
          v-if="activeBoard"
          :settings="settings"
          :rows="sheets.find((s) => s.name === activeTab)?.rows ?? []"
          :mapping="activeBoard.mapping"
        />

        <ActionFilter :settings="settings" />
      </div>
    </nav>

    <main class="main">
      <div v-if="!hasData && !loading" class="empty">
        <span class="empty-icon">🔗</span>
        <p class="empty-title">เชื่อมต่อ Google Sheets</p>
        <p class="empty-desc">กด ⚙ เพื่อวางลิงก์และเลือกแท็บ FE-tasks, Bugs</p>
        <button type="button" class="btn primary" @click="showSettings = true">
          เปิดตั้งค่า
        </button>
      </div>

      <template v-else-if="!settings.showRawTable">
        <p v-if="fetchWarnings.length" class="warnings">
          {{ fetchWarnings.join(" · ") }}
        </p>
        <KanbanBoard
          v-if="activeBoard"
          :key="activeBoard.name"
          :columns="activeBoard.columns"
          :compact="settings.showOnlyMatches"
          :spreadsheet-id="spreadsheetId"
          :sheet-name="activeBoard.name"
          :writable="statusWritable"
          @status-change="onStatusChange"
        />
      </template>

      <div v-else class="raw-table">
        <textarea ref="rawRef" readonly :value="rawTableText" />
      </div>
    </main>

    <SettingsDrawer
      v-if="showSettings"
      :settings="settings"
      :rows="referenceRows"
      :cols="cols"
      :loading="loading"
      :error="error"
      :column-label="columnLabel"
      @close="showSettings = false"
      @fetch="fetchData"
    />
  </div>
</template>
