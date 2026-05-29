<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import KanbanBoard from "./components/KanbanBoard.vue";
import SettingsDrawer from "./components/SettingsDrawer.vue";
import StatusFilter from "./components/StatusFilter.vue";
import {
  autoDetectMapping,
  buildKanban,
  buildKanbanCopyText,
  countMatches,
  type ColumnMapping,
} from "./lib/kanban";
import {
  buildFullTableText,
  columnCount,
  columnLabel,
  ACTION_OPTIONS,
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
const showSettings = ref(false);
const activeTab = ref("");

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
    return {
      name: sheet.name,
      mapping,
      matchCount: countMatches(sheet.rows, settings.value, mapping),
      columns: buildKanban(sheet.rows, settings.value, mapping),
    };
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

watch(settings, (s) => saveSettings(s), { deep: true });

watch(sheetBoards, (boards) => {
  if (boards.length === 0) return;
  if (!boards.some((b) => b.name === activeTab.value)) {
    activeTab.value = boards[0].name;
  }
});

onMounted(async () => {
  if (settings.value.spreadsheetInput.trim()) {
    await fetchData();
  } else {
    showSettings.value = true;
  }
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
      activeTab.value = sheets.value[0]?.name ?? "";
      showSettings.value = false;
    }
    if (
      settings.value.nameColumn !== null &&
      settings.value.nameColumn >= cols.value
    ) {
      settings.value.nameColumn = null;
    }
  } catch (e) {
    sheets.value = [];
    error.value = String(e);
  } finally {
    loading.value = false;
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

const rawRef = ref<HTMLTextAreaElement | null>(null);
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
          <span v-if="copyNotice" class="notice">{{ copyNotice }}</span>
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

        <div class="action-filter">
          <span class="action-label">Action</span>
          <div class="action-pills">
            <button
              v-for="opt in ACTION_OPTIONS"
              :key="opt.label"
              type="button"
              class="action-pill"
              :class="[opt.tone, { active: settings.actionFilter === opt.value }]"
              @click="settings.actionFilter = opt.value"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
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
