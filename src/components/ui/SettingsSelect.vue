<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from "vue";

interface Option {
  value: string | number | null;
  label: string;
}

const props = defineProps<{
  modelValue: string | number | null;
  options: Option[];
  placeholder?: string;
  id?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [val: string | number | null];
}>();

const open = ref(false);
const wrapRef = ref<HTMLDivElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelStyle = ref<Record<string, string>>({});

const selectedLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? props.placeholder ?? "",
);

function computePosition() {
  if (!triggerRef.value) return;
  const rect = triggerRef.value.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const style: Record<string, string> = {
    position: "fixed",
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: "500",
  };
  if (spaceBelow < 220 && rect.top > 220) {
    style.bottom = `${window.innerHeight - rect.top + 4}px`;
  } else {
    style.top = `${rect.bottom + 4}px`;
  }
  panelStyle.value = style;
}

async function toggle() {
  if (!open.value) {
    open.value = true;
    await nextTick();
    computePosition();
  } else {
    open.value = false;
  }
}

function select(val: string | number | null) {
  emit("update:modelValue", val);
  open.value = false;
}

function onOutside(e: MouseEvent) {
  if (wrapRef.value && !wrapRef.value.contains(e.target as Node)) {
    open.value = false;
  }
}

// Close on scroll (panel is fixed so it won't follow the trigger)
function onScroll() {
  open.value = false;
}

watch(open, (val) => {
  if (val) window.addEventListener("scroll", onScroll, { passive: true, capture: true });
  else window.removeEventListener("scroll", onScroll, { capture: true });
});

onMounted(() => document.addEventListener("mousedown", onOutside));
onUnmounted(() => {
  document.removeEventListener("mousedown", onOutside);
  window.removeEventListener("scroll", onScroll, { capture: true });
});
</script>

<template>
  <div ref="wrapRef" class="s-sel" :class="{ open }">
    <button
      ref="triggerRef"
      :id="id"
      type="button"
      class="s-sel-trigger"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="s-sel-value">{{ selectedLabel }}</span>
      <svg
        class="s-sel-chevron"
        width="11"
        height="7"
        viewBox="0 0 11 7"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M1 1l4.5 4.5L10 1"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <Transition name="s-drop">
      <div v-if="open" class="s-sel-panel" :style="panelStyle">
        <button
          v-for="opt in options"
          :key="String(opt.value)"
          type="button"
          class="s-sel-opt"
          :class="{ sel: opt.value === modelValue }"
          @click="select(opt.value)"
        >
          <span class="s-sel-mark" aria-hidden="true">
            <svg
              v-if="opt.value === modelValue"
              width="11"
              height="8"
              viewBox="0 0 11 8"
              fill="none"
            >
              <path
                d="M1 4l3 3L10 1"
                stroke="#0369a1"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          {{ opt.label }}
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.s-sel {
  position: relative;
  width: 100%;
}

.s-sel-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid #dde3eb;
  background: #f9fafb;
  color: #111827;
  font-size: 13px;
  font-family: inherit;
  font-weight: 400;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.s-sel-trigger:hover {
  border-color: #bbc6d4;
  background: #fff;
}

.s-sel.open .s-sel-trigger {
  border-color: #0369a1;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(3, 105, 161, 0.1);
}

.s-sel-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.s-sel-chevron {
  flex-shrink: 0;
  color: #9ca3af;
  transition: transform 0.2s ease, color 0.2s ease;
}

.s-sel.open .s-sel-chevron {
  transform: rotate(180deg);
  color: #0369a1;
}

.s-sel-panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow:
    0 12px 40px rgba(15, 23, 42, 0.13),
    0 2px 8px rgba(15, 23, 42, 0.06);
  overflow-y: auto;
  max-height: 240px;
  padding: 5px;
}

.s-sel-opt {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #111827;
  font-size: 13px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 0.1s ease;
}

.s-sel-opt:hover {
  background: #f3f5f8;
}

.s-sel-opt.sel {
  color: #0369a1;
  font-weight: 500;
}

.s-sel-mark {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Dropdown animation */
.s-drop-enter-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.s-drop-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.s-drop-enter-from,
.s-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
