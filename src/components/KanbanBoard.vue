<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { avatarColor, initials, type KanbanColumn } from "../lib/kanban";
import { sheetRowUrl } from "../lib/sheetsLogic";

const props = defineProps<{
  columns: KanbanColumn[];
  compact?: boolean;
  spreadsheetId?: string;
  sheetName?: string;
}>();

function openRow(sheetRow: number) {
  if (!props.spreadsheetId || !props.sheetName) return;
  const url = sheetRowUrl(props.spreadsheetId, props.sheetName, sheetRow);
  invoke("open_url", { url });
}

function actionTone(action: string): string {
  const v = action.trim().toLowerCase();
  if (v === "this week") return "green";
  if (v === "next week") return "yellow";
  if (v === "later") return "gray";
  if (v.includes("ยังไม่")) return "red";
  if (v.includes("ยกเลิก")) return "cancel";
  return "gray";
}

function categoryTone(cat: string): string {
  const c = cat.toLowerCase();
  if (c.includes("ui")) return "ui";
  if (c.includes("recheck")) return "recheck";
  if (c.includes("bug")) return "bug";
  if (c.includes("api")) return "api";
  return "default";
}
</script>

<template>
  <div class="kanban-wrap">
    <div v-if="columns.length === 0" class="kanban-empty">
      <span class="empty-icon">📋</span>
      <p>ไม่มีงานของคุณในแท็บนี้</p>
    </div>

    <div v-else class="kanban-board">
      <section
        v-for="column in columns"
        :key="column.id"
        class="kanban-column"
      >
        <div class="column-head">
          <span
            class="column-label"
            :style="{
              background: column.chipStyle.bg,
              color: column.chipStyle.color,
            }"
          >
            {{ column.label }}
          </span>
          <span class="column-count">{{
            column.cards.length + (column.overflowCount ?? 0)
          }}</span>
        </div>

        <div class="column-cards">
          <article
            v-for="card in column.cards"
            :key="card.id"
            class="task-card"
            :class="{ 'task-card--linkable': spreadsheetId }"
          >
            <div
              v-if="
                card.category ||
                card.action ||
                card.flowId ||
                card.taskId
              "
              class="card-top"
            >
              <div v-if="card.category || card.action" class="card-meta">
                <span
                  v-if="card.category"
                  class="category-badge"
                  :data-kind="categoryTone(card.category)"
                >
                  {{ card.category }}
                </span>
                <span
                  v-if="card.action"
                  class="action-badge"
                  :data-action="actionTone(card.action)"
                >
                  {{ card.action }}
                </span>
              </div>

              <div v-if="card.flowId || card.taskId" class="card-refs">
                <span v-if="card.flowId" class="card-ref">
                  <span class="card-ref-label">Flow</span>
                  {{ card.flowId }}
                </span>
                <span v-if="card.flowId && card.taskId" class="card-ref-sep">·</span>
                <span v-if="card.taskId" class="card-ref card-ref-id">
                  {{ card.taskId }}
                </span>
              </div>
            </div>

            <h3
              v-if="card.displayTitle"
              class="card-headline"
              :title="card.displayTitle"
            >
              {{ card.displayTitle }}
            </h3>

            <ul v-if="card.checklist.length" class="checklist">
              <li
                v-for="(item, i) in card.checklist"
                :key="i"
                class="check-item"
                :class="{ done: item.done }"
              >
                <span class="check-box" aria-hidden="true">
                  {{ item.done ? "✓" : "" }}
                </span>
                <span class="check-text">{{ item.text }}</span>
              </li>
            </ul>

            <div
              v-if="card.assignees.length && !compact"
              class="card-assignees"
            >
              <span
                v-for="person in card.assignees"
                :key="person"
                class="assignee"
              >
                <span
                  class="avatar"
                  :style="{ background: avatarColor(person) }"
                >
                  {{ initials(person) }}
                </span>
                {{ person }}
              </span>
            </div>

            <div v-if="card.tags.length" class="card-tags">
              <span
                v-for="(tag, i) in card.tags.slice(0, 3)"
                :key="`${card.id}-tag-${i}`"
                class="tag"
                :data-kind="i % 3"
              >
                {{ tag }}
              </span>
            </div>

            <button
              v-if="spreadsheetId"
              type="button"
              class="card-row-link"
              :title="`เปิดใน Sheets (แถว ${card.sheetRow})`"
              @click.stop="openRow(card.sheetRow)"
            >
              <span class="card-row-num">{{ card.sheetRow }}</span>
              ↗
            </button>
          </article>

          <p v-if="column.overflowCount" class="column-overflow">
            และอีก {{ column.overflowCount }} งาน
          </p>
        </div>
      </section>
    </div>
  </div>
</template>
