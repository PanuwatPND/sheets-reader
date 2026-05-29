<script setup lang="ts">
import type { Settings } from "../lib/sheetsLogic";

defineProps<{
  settings: Settings;
  rows: string[][];
  cols: number;
  loading: boolean;
  error: string | null;
  columnLabel: (
    col: number,
    rows: string[][],
    firstRowIsHeader: boolean,
  ) => string;
}>();

const emit = defineEmits<{
  close: [];
  fetch: [];
}>();
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
              <input
                id="sheet-url"
                v-model="settings.spreadsheetInput"
                type="text"
                class="settings-input"
                placeholder="https://docs.google.com/spreadsheets/d/..."
                @keydown.enter.meta.prevent="emit('fetch')"
              />
            </div>

            <div class="settings-field-row">
              <div class="settings-field">
                <label for="sheet-tabs">แท็บที่อ่าน</label>
                <input
                  id="sheet-tabs"
                  v-model="settings.sheetTabs"
                  type="text"
                  class="settings-input"
                  placeholder="FE-tasks, Bugs"
                />
                <span class="settings-hint">คั่นด้วย comma</span>
              </div>
              <div class="settings-field settings-field--narrow">
                <label for="cell-range">ช่วงเซลล์</label>
                <input
                  id="cell-range"
                  v-model="settings.cellRange"
                  type="text"
                  class="settings-input"
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
              <select
                id="name-column"
                v-model="settings.nameColumn"
                class="settings-input settings-select"
              >
                <option :value="null">Assignee / Doing (แนะนำ)</option>
                <option v-for="c in cols" :key="c" :value="c - 1">
                  {{ columnLabel(c - 1, rows, settings.firstRowIsHeader) }}
                </option>
              </select>
              <span class="settings-hint">
                กรองจาก Assignee — ไม่เห็นงานของคนอื่น
              </span>
            </div>

            <label class="settings-switch">
              <span class="settings-switch-text">
                <span class="settings-switch-label">รวมงานที่ assign หลายคน</span>
                <span class="settings-switch-desc">
                  เปิด = Pond + Bank · ปิด = ชื่อคุณคนเดียว
                </span>
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
            <label class="settings-switch">
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
        <p class="drawer-foot-note">
          ปิดหน้าต่างแล้วแอปยังอยู่ที่ menubar
        </p>
      </footer>
    </aside>
  </div>
</template>
