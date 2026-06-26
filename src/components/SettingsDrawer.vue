<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
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

const saEmail = ref<string | null>(null);
const saError = ref<string | null>(null);
const saTesting = ref(false);
const saTestOk = ref(false);
const saCopyNotice = ref<string | null>(null);

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

const saReady = computed(
  () => !!props.settings.serviceAccountPath.trim() && !!saEmail.value && saTestOk.value,
);

async function loadSaEmail() {
  saError.value = null;
  saTestOk.value = false;
  saEmail.value = null;
  const path = props.settings.serviceAccountPath.trim();
  if (!path) return;
  try {
    saEmail.value = await invoke<string>("read_service_account_email", { path });
  } catch (e) {
    saError.value = String(e);
  }
}

watch(
  () => props.settings.serviceAccountPath,
  () => {
    void loadSaEmail();
  },
  { immediate: true },
);

async function browseServiceAccount() {
  const picked = await invoke<string | null>("pick_service_account_file");
  if (picked) {
    props.settings.serviceAccountPath = picked;
  }
}

async function testServiceAccount() {
  const path = props.settings.serviceAccountPath.trim();
  if (!path) return;
  saTesting.value = true;
  saError.value = null;
  saTestOk.value = false;
  try {
    await invoke("test_service_account", { path });
    saTestOk.value = true;
  } catch (e) {
    saError.value = String(e);
  } finally {
    saTesting.value = false;
  }
}

function copySaEmail() {
  if (!saEmail.value) return;
  navigator.clipboard.writeText(saEmail.value).then(() => {
    saCopyNotice.value = "คัดลอกแล้ว";
    setTimeout(() => {
      saCopyNotice.value = null;
    }, 2000);
  });
}
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
          <h3 class="settings-section-title">ย้ายสถานะจากแอพ</h3>
          <div class="settings-card">
            <div class="settings-callout settings-callout--info">
              <span class="settings-callout-icon" aria-hidden="true">ℹ️</span>
              <p>
                <strong>ไม่ต้องเป็นเจ้าของชีท</strong> — Service Account สร้างจาก Google account ส่วนตัวได้ (ฟรี)
                แล้วส่ง email ด้านล่างให้คนดูแลชีท (PM / admin) แชร์เป็น <strong>Editor</strong> แทนคุณ
              </p>
            </div>

            <ol class="sa-steps">
              <li>
                เปิด
                <a
                  href="#"
                  @click.prevent="invoke('open_url', { url: 'https://console.cloud.google.com/iam-admin/serviceaccounts' })"
                >Google Cloud → Service Accounts</a>
                สร้าง Service Account แล้วดาวน์โหลดไฟล์ JSON (ใช้ Gmail ส่วนตัวได้)
              </li>
              <li>เปิด Google Sheets API ในโปรเจกต์เดียวกัน (APIs &amp; Services → Library → Google Sheets API → Enable)</li>
              <li>เลือกไฟล์ JSON → คัดลอก email → ส่งให้คนดูแลชีทแชร์เป็น <strong>Editor</strong></li>
              <li>หลัง admin แชร์แล้ว กดทดสอบการเชื่อมต่อ แล้วลากการ์ดข้ามคอลัมน์ Kanban</li>
            </ol>

            <div class="settings-field">
              <label for="service-account">ไฟล์ Service Account</label>
              <div class="sa-file-row">
                <div class="sa-file-input">
                  <SettingsInput
                    id="service-account"
                    v-model="settings.serviceAccountPath"
                    placeholder="เลือกไฟล์ .json"
                  />
                </div>
                <button type="button" class="sa-btn" @click="browseServiceAccount">
                  เลือกไฟล์
                </button>
              </div>
            </div>

            <div v-if="saEmail" class="sa-email-box">
              <span class="sa-email-label">แชร์ชีทให้</span>
              <code class="sa-email">{{ saEmail }}</code>
              <button type="button" class="sa-btn sa-btn--small" @click="copySaEmail">
                คัดลอก
              </button>
              <span v-if="saCopyNotice" class="sa-copy-notice">{{ saCopyNotice }}</span>
            </div>

            <div class="sa-actions">
              <button
                type="button"
                class="sa-btn"
                :disabled="!settings.serviceAccountPath.trim() || saTesting"
                @click="testServiceAccount"
              >
                {{ saTesting ? "กำลังทดสอบ…" : "ทดสอบการเชื่อมต่อ" }}
              </button>
              <span v-if="saTestOk" class="sa-status sa-status--ok">พร้อมลากการ์ดย้ายสถานะ</span>
              <span v-else-if="settings.serviceAccountPath.trim() && saEmail" class="sa-status">ยังไม่ได้ทดสอบ</span>
            </div>

            <p v-if="saError" class="sa-error">{{ saError }}</p>
            <p v-if="saReady" class="settings-hint sa-ready-hint">
              ตั้งค่าเสร็จแล้ว — ปิดหน้าต่างนี้แล้วลากการ์ดไปคอลัมน์สถานะใหม่ได้เลย
            </p>
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
              <span class="settings-hint">
                ตัวเลขนับถอยหลังจะแสดงข้างปุ่มรีเฟรช
              </span>
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
