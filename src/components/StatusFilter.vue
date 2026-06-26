<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { collectAllStatuses, isStatusHidden, statusChipStyle, toggleStatusHidden } from "../lib/kanban";
import type { ColumnMapping } from "../lib/kanban";
import type { Settings } from "../lib/sheetsLogic";

const props = defineProps<{
  settings: Settings;
  rows: string[][];
  mapping: ColumnMapping;
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const statuses = computed(() =>
  collectAllStatuses(props.rows, props.settings, props.mapping),
);

const visibleCount = computed(
  () =>
    statuses.value.filter((s) => !isStatusHidden(s, props.settings.hiddenStatuses))
      .length,
);

function toggle(status: string) {
  toggleStatusHidden(status, props.settings.hiddenStatuses);
}

function showAll() {
  props.settings.hiddenStatuses.splice(0, props.settings.hiddenStatuses.length);
}

function hideAll() {
  props.settings.hiddenStatuses.splice(
    0,
    props.settings.hiddenStatuses.length,
    ...statuses.value,
  );
}

function onDocClick(e: MouseEvent) {
  if (!open.value || !root.value) return;
  if (!root.value.contains(e.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener("click", onDocClick));
onUnmounted(() => document.removeEventListener("click", onDocClick));
</script>

<template>
  <div ref="root" class="status-filter">
    <button
      type="button"
      class="status-trigger"
      :class="{ open, active: visibleCount < statuses.length }"
      @click.stop="open = !open"
    >
      <span class="status-trigger-label">Status</span>
      <span v-if="statuses.length" class="status-trigger-count">
        {{ visibleCount }}/{{ statuses.length }}
      </span>
      <span class="status-trigger-caret" aria-hidden="true">▾</span>
    </button>

    <div v-if="open" class="status-panel" @click.stop>
      <div class="status-panel-head">
        <span>แสดงคอลัมน์</span>
        <div class="status-panel-actions">
          <button type="button" class="link-btn" @click="showAll">ทั้งหมด</button>
          <button type="button" class="link-btn" @click="hideAll">ซ่อนทั้งหมด</button>
        </div>
      </div>

      <div v-if="statuses.length === 0" class="status-empty">
        ไม่มี status ใน filter ปัจจุบัน
      </div>

      <ul v-else class="status-list">
        <li v-for="status in statuses" :key="status">
          <button
            type="button"
            class="status-option"
            :class="{ off: isStatusHidden(status, settings.hiddenStatuses) }"
            @click="toggle(status)"
          >
            <span
              class="status-chip"
              :style="{
                background: statusChipStyle(status).bg,
                color: statusChipStyle(status).color,
              }"
            >
              {{ status }}
            </span>
            <span class="status-check" aria-hidden="true">
              {{ isStatusHidden(status, settings.hiddenStatuses) ? "" : "✓" }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
