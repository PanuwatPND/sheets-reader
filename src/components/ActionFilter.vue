<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ACTION_OPTIONS, type ActionFilter, type Settings } from "../lib/sheetsLogic";

const props = defineProps<{
  settings: Settings;
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const activeOption = computed(
  () => ACTION_OPTIONS.find((o) => o.value === props.settings.actionFilter) ?? ACTION_OPTIONS[0],
);

function onDocClick(e: MouseEvent) {
  if (!open.value || !root.value) return;
  if (!root.value.contains(e.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener("click", onDocClick));
onUnmounted(() => document.removeEventListener("click", onDocClick));
</script>

<template>
  <div ref="root" class="action-filter" :class="{ open }">
    <button
      type="button"
      class="action-toggle"
      :title="open ? 'ซ่อน Action' : 'แสดง Action'"
      :aria-expanded="open"
      @click.stop="open = !open"
    >
      <span class="action-toggle-chevron" aria-hidden="true">‹</span>
      <span v-if="!open" class="action-toggle-summary">{{ activeOption.label }}</span>
    </button>

    <div class="action-pills-panel" @click.stop>
      <div class="action-pills">
        <button
          v-for="opt in ACTION_OPTIONS"
          :key="opt.label"
          type="button"
          class="action-pill"
          :class="[opt.tone, { active: settings.actionFilter === opt.value }]"
          @click="
            settings.actionFilter = opt.value as ActionFilter;
            open = false;
          "
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
  </div>
</template>
