<script setup lang="ts">
import { computed } from "vue";
import type { Settings } from "../lib/sheetsLogic";
import SettingsInput from "./ui/SettingsInput.vue";
import SettingsSelect from "./ui/SettingsSelect.vue";

const props = defineProps<{
  settings: Settings;
  rows: string[][];
  cols: number;
  loading: boolean;
  error: string | null;
  columnLabel: (col: number, rows: string[][], firstRowIsHeader: boolean) => string;
}>();

const emit = defineEmits<{
  close: [];
  fetch: [];
}>();

const nameColumnOptions = computed(() => [
  { value: null as number | null, label: "Assignee / Doing (แนะนำ)" },
  ...Array.from({ length: props.cols }, (_, i) => ({
    value: i as number | null,
    label: props.columnLabel(i, props.rows, props.settings.firstRowIsHeader),
  })),
]);

const autoRefreshOptions = [
  { value: 0, label: "ปิด" },
  { value: 5, label: "ทุก 5 นาที" },
  { value: 10, label: "ทุก 10 นาที" },
  { value: 15, label: "ทุก 15 นาที" },
  { value: 30, label: "ทุก 30 นาที" },
];
</script>

<template>
  <div class="drawer-backdrop" @click.self="emit('close')">
    <aside class="drawer">
      <header class="drawer-head">
        <div class="drawer-head-text">
          <h2>ตั้งค่า</h2>
          <p class="drawer-sub">เชื่อมต่อและกรองข้อมูลจาก Google Sheets</p>
        </div>
        <button
          type="button"
          class="drawer-close"
          title="ปิด"
          @click="emit('close')"
        >
          ✕
        </button>
      </header>

      <div class="drawer-body">
        <section class="settings-section">
          <h3 class="settings-section-title">แหล่งข้อมูล</h3>
          <div class="settings-card">
            <div class="settings-callout">
              <span class="settings-callout-icon" aria-hidden="true">🔗</span>
              <p>
                ชีทต้อง Share เป็น
                <strong>Anyone with the link</strong> (Viewer)
              </p>
            </div>

            <div class="settings-field">
              <label for="sheet-url">Spreadsheet URL หรือ ID</label>
              <SettingsInput
                id="sheet-url"
                v-model="settings.spreadsheetInput"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                @enter="emit('fetch')"
              />
            </div>

            <div class="settings-field-row">
              <div class="settings-field">
                <label for="sheet-tabs">แท็บที่อ่าน</label>
                <SettingsInput
                  id="sheet-tabs"
                  v-model="settings.sheetTabs"
                  placeholder="FE-tasks, Bugs"
                />
                <span class="settings-hint">คั่นด้วย comma</span>
              </div>
              <div class="settings-field settings-field--narrow">
                <label for="cell-range">ช่วงเซลล์</label>
                <SettingsInput
                  id="cell-range"
                  v-model="settings.cellRange"
                  placeholder="A1:T2000"
                />
              </div>
            </div>

            <label class="settings-switch">
              <span class="settings-switch-text">แถวแรกเป็นหัวตาราง</span>
              <input
                v-model="settings.firstRowIsHeader"
                type="checkbox"
                class="settings-switch-input"
              />
              <span class="settings-switch-track" aria-hidden="true" />
            </label>
          </div>
        </section>

        <section class="settings-section">
          <h3 class="settings-section-title">การกรองงาน</h3>
          <div class="settings-card">
            <div class="settings-field">
              <label for="name-column">ค้นจากคอลัมน์</label>
              <SettingsSelect
                id="name-column"
                :model-value="settings.nameColumn"
                :options="nameColumnOptions"
                @update:model-value="(v) => (settings.nameColumn = v as Settings['nameColumn'])"
              />
              <span class="settings-hint">
                กรองจาก Assignee — ไม่เห็นงานของคนอื่น
              </span>
            </div>

            <label class="settings-switch">
              <span class="settings-switch-text">
                <span class="settings-switch-label">รวมงานที่ assign หลายคน</span>
              </span>
              <input
                v-model="settings.includeSharedAssignees"
                type="checkbox"
                class="settings-switch-input"
              />
              <span class="settings-switch-track" aria-hidden="true" />
            </label>
          </div>
        </section>

        <section class="settings-section">
          <h3 class="settings-section-title">เพิ่มเติม</h3>
          <div class="settings-card settings-card--compact">
            <div class="settings-field">
              <label>Menu bar</label>
              <div class="seg-ctrl" role="group">
                <button
                  type="button"
                  class="seg-ctrl-btn"
                  :class="{ active: settings.trayDisplay === 'numbers' }"
                  @click="settings.trayDisplay = 'numbers'"
                >
                  Numbers
                </button>
                <button
                  type="button"
                  class="seg-ctrl-btn"
                  :class="{ active: settings.trayDisplay === 'icon' }"
                  @click="settings.trayDisplay = 'icon'"
                >
                  Icon
                </button>
              </div>
            </div>

            <div class="settings-field" style="margin-top: 14px;">
              <label for="auto-refresh">รีเฟรชอัตโนมัติ</label>
              <SettingsSelect
                id="auto-refresh"
                :model-value="settings.autoRefreshMinutes"
                :options="autoRefreshOptions"
                @update:model-value="(v) => (settings.autoRefreshMinutes = v as Settings['autoRefreshMinutes'])"
              />
            </div>

            <label class="settings-switch" style="margin-top: 4px;">
              <span class="settings-switch-text">ดูตารางดิบ</span>
              <input
                v-model="settings.showRawTable"
                type="checkbox"
                class="settings-switch-input"
              />
              <span class="settings-switch-track" aria-hidden="true" />
            </label>
          </div>
        </section>
      </div>

      <footer class="drawer-foot">
        <p v-if="error" class="drawer-error">{{ error }}</p>
        <button
          type="button"
          class="drawer-fetch"
          :disabled="loading || !settings.spreadsheetInput.trim()"
          @click="emit('fetch')"
        >
          <span v-if="loading" class="drawer-fetch-spinner" aria-hidden="true" />
          {{ loading ? "กำลังโหลด…" : "อ่านข้อมูล" }}
        </button>
        <p class="drawer-foot-note">ปิดหน้าต่างแล้วแอปยังอยู่ที่ menubar</p>
      </footer>
    </aside>
  </div>
</template>
