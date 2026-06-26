<script setup lang="ts">
defineProps<{
  modelValue: string;
  placeholder?: string;
  id?: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [val: string];
  enter: [];
}>();
</script>

<template>
  <input
    :id="id"
    class="s-input"
    type="text"
    :value="modelValue"
    :placeholder="placeholder"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    @keydown.enter.meta.prevent="emit('enter')"
  />
</template>

<style scoped>
.s-input {
  width: 100%;
  padding: 9px 13px;
  border-radius: 10px;
  border: 1px solid #dde3eb;
  background: #f9fafb;
  color: #111827;
  font-size: 13px;
  font-family: inherit;
  -webkit-appearance: none;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background 0.15s ease;
}

.s-input::placeholder {
  color: #a8b4c2;
}

.s-input:hover {
  border-color: #bbc6d4;
  background: #fff;
}

.s-input:focus {
  outline: none;
  border-color: #0369a1;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(3, 105, 161, 0.1);
}
</style>
