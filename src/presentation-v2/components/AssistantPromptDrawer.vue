<template>
  <AcuDrawer
    :is-open="isOpen"
    title="Sửa prompt trợ lý AI sửa bảng"
    width="720px"
    :before-close="confirmIfDirty"
    @close="emit('close')"
  >
    <AcuMessage v-if="message" :kind="message.kind">
      {{ message.text }}
    </AcuMessage>

    <details class="acu-assistant-prompt-drawer__placeholders">
      <summary>Placeholder khả dụng ({{ placeholderDocs.length }})</summary>
      <div class="acu-assistant-prompt-drawer__placeholder-group">
        <p class="acu-assistant-prompt-drawer__placeholder-note">
          Khi prompt có bất kỳ placeholder dữ liệu nào, coi như bạn tự quản việc chèn dữ liệu, hệ thống không tự thêm tin nhắn dữ liệu nữa; ngữ cảnh lịch sử thực sẽ được chèn trước lần xuất hiện cuối cùng của
          <code>{{ userRequestToken }}</code>.
        </p>
        <ul class="acu-assistant-prompt-drawer__placeholder-list">
          <li
            v-for="doc in dataDocs"
            :key="doc.token"
            class="acu-assistant-prompt-drawer__placeholder-item"
          >
            <code>{{ doc.token }}</code>
            <strong>{{ doc.label }}</strong>
            <span>{{ doc.description }}</span>
          </li>
        </ul>
      </div>
      <div v-if="referenceDocs.length > 0" class="acu-assistant-prompt-drawer__placeholder-group">
        <ul class="acu-assistant-prompt-drawer__placeholder-list">
          <li
            v-for="doc in referenceDocs"
            :key="doc.token"
            class="acu-assistant-prompt-drawer__placeholder-item"
          >
            <code>{{ doc.token }}</code>
            <strong>{{ doc.label }}</strong>
            <span>{{ doc.description }}</span>
          </li>
        </ul>
      </div>
    </details>

    <div class="acu-assistant-prompt-drawer__toolbar">
      <AcuFileButton size="sm" accept="application/json,.json" @file="$emit('import-file', $event)">
        <i class="fa-solid fa-download"></i> Nhập JSON
      </AcuFileButton>
      <AcuButton size="sm" @click="$emit('export')">
        <i class="fa-solid fa-upload"></i> Xuất JSON
      </AcuButton>
      <AcuButton size="sm" variant="primary" @click="$emit('reset')">Nạp prompt mặc định</AcuButton>
    </div>

    <AcuPromptSegments
      :segments="segments"
      :show-slot="false"
      :rows="8"
      empty-text="Chưa có đoạn prompt. Bấm nút bên dưới để thêm đoạn đầu tiên."
      @add="$emit('add', $event)"
      @delete="$emit('delete', $event)"
      @update="(index, patch) => $emit('update', index, patch)"
    />

    <footer class="acu-assistant-prompt-drawer__actions">
      <AcuButton @click="requestClose">Đóng</AcuButton>
      <AcuButton variant="primary" :disabled="!dirty" @click="$emit('save')">Lưu prompt</AcuButton>
    </footer>
  </AcuDrawer>
</template>

<script setup lang="ts">
import AcuButton from './_lib/AcuButton.vue';
import AcuDrawer from './_lib/AcuDrawer.vue';
import AcuFileButton from './_lib/AcuFileButton.vue';
import AcuInfoBanner from './_lib/AcuInfoBanner.vue';
import AcuMessage from './_lib/AcuMessage.vue';
import AcuPromptSegments, { type PromptSegment } from './_lib/AcuPromptSegments.vue';
import { useDialogStore } from '../stores/dialog-store';
import { computed } from 'vue';
import {
  TEMPLATE_ASSISTANT_PLACEHOLDER_DOCS_ACU,
  TEMPLATE_ASSISTANT_PLACEHOLDER_USER_REQUEST_ACU,
} from '../../service/template-assistant/service';

const props = defineProps<{
  isOpen: boolean;
  segments: PromptSegment[];
  dirty: boolean;
  message: { kind: 'info' | 'success' | 'warning' | 'error'; text: string } | null;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save'): void;
  (e: 'reset'): void;
  (e: 'import-file', file: File): void;
  (e: 'export'): void;
  (e: 'add', position: 'top' | 'bottom'): void;
  (e: 'delete', index: number): void;
  (e: 'update', index: number, patch: Partial<PromptSegment>): void;
}>();

const placeholderDocs = TEMPLATE_ASSISTANT_PLACEHOLDER_DOCS_ACU;
const dataDocs = computed(() => placeholderDocs.filter((doc) => doc.kind === 'data'));
const referenceDocs = computed(() => placeholderDocs.filter((doc) => doc.kind === 'reference'));
const userRequestToken = TEMPLATE_ASSISTANT_PLACEHOLDER_USER_REQUEST_ACU;
const dialogStore = useDialogStore();

async function confirmIfDirty(): Promise<boolean> {
  if (!props.dirty) return true;
  return dialogStore.confirm({
    title: 'Đóng trình sửa prompt',
    message: 'Bạn có thay đổi prompt chưa lưu, chắc chắn đóng?',
    confirmLabel: 'Đóng',
    confirmVariant: 'danger',
  });
}

async function requestClose(): Promise<void> {
  if (await confirmIfDirty()) emit('close');
}
</script>

<style scoped>
.acu-assistant-prompt-drawer__placeholders {
  margin-bottom: 12px;
}

.acu-assistant-prompt-drawer__placeholders summary {
  cursor: pointer;
  font-size: 13px;
  color: var(--acu-text-2);
  user-select: none;
}

.acu-assistant-prompt-drawer__placeholder-group {
  margin-top: 8px;
}

.acu-assistant-prompt-drawer__placeholder-note {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--acu-text-2);
}

.acu-assistant-prompt-drawer__placeholder-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.acu-assistant-prompt-drawer__placeholder-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
  color: var(--acu-text-1);
}

.acu-assistant-prompt-drawer__placeholder-item code {
  flex-shrink: 0;
  font-size: 11px;
}

.acu-assistant-prompt-drawer__placeholder-item span {
  color: var(--acu-text-2);
}

.acu-assistant-prompt-drawer__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.acu-assistant-prompt-drawer__actions {
  position: sticky;
  bottom: -16px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 0 0;
  background: var(--acu-bg-1);
}
</style>
