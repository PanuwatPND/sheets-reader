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
        <h2>ตั้งค่า</h2>
        <button type="button" class="icon-btn" title="ปิด" @click="emit('close')">
          ✕
        </button>
      </header>

      <div class="drawer-body">
        <p class="public-note">
          ใช้ลิงก์ public — ไม่ต้องใช้ Service Account<br />
          ชีทต้อง Share → <strong>Anyone with the link</strong> (Viewer)
        </p>

        <div class="field">
          <label>Spreadsheet URL หรือ ID</label>
          <input
            v-model="settings.spreadsheetInput"
            type="text"
            placeholder="วางลิงก์ Google Sheets"
            @keydown.enter.meta.prevent="emit('fetch')"
          />
        </div>

        <div class="field">
          <label>แท็บที่ต้องการอ่าน</label>
          <input
            v-model="settings.sheetTabs"
            type="text"
            placeholder="FE-tasks, Bugs"
          />
          <span class="field-hint">คั่นด้วย comma — อ่านเฉพาะแท็บนี้ ไม่โหลดทั้งชีท</span>
        </div>

        <div class="field">
          <label>ช่วงเซลล์ (ทุกแท็บ)</label>
          <input
            v-model="settings.cellRange"
            type="text"
            placeholder="A1:Z2000"
          />
        </div>

        <label class="toggles inline">
          <input v-model="settings.firstRowIsHeader" type="checkbox" />
          แถวแรกเป็นหัวตาราง
        </label>

        <button
          type="button"
          class="btn primary full"
          :disabled="loading"
          @click="emit('fetch')"
        >
          {{ loading ? "กำลังโหลด…" : "อ่านข้อมูล" }}
        </button>

        <p v-if="error" class="error">{{ error }}</p>

        <hr class="divider" />

        <p class="section-label">จับคู่คอลัมน์</p>

        <div class="field">
          <label>ค้นจากคอลัมน์ (ชื่อ)</label>
          <select v-model="settings.nameColumn">
            <option :value="null">Assignee / Doing (แนะนำ)</option>
            <option v-for="c in cols" :key="c" :value="c - 1">
              {{ columnLabel(c - 1, rows, settings.firstRowIsHeader) }}
            </option>
          </select>
        </div>

        <p class="field-hint">
          ค่าเริ่มต้นกรองจากคอลัมน์ Assignee เท่านั้น — จะไม่เห็นงานของคนอื่น
        </p>

        <label class="toggles inline">
          <input v-model="settings.showRawTable" type="checkbox" />
          ดูตารางดิบ
        </label>

        <p class="tray-note">
          ปิดหน้าต่างแล้วแอปยังอยู่ที่ menubar
        </p>
      </div>
    </aside>
  </div>
</template>
