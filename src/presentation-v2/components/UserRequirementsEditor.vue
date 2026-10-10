<template>
  <section class="acu-requirements-editor" aria-label="Sửa yêu cầu người dùng">
    <p class="acu-requirements-editor__hint">Mỗi thẻ là một yêu cầu của người dùng; bấm thêm thẻ rồi nhập trực tiếp. Khi lưu sẽ tự chuyển thành mảng chuỗi.</p>
    <div v-for="(item, index) in items" :key="index" class="acu-requirements-editor__row">
      <label :for="`acu-requirement-${editorId}-${index}`">Yêu cầu {{ index + 1 }}</label>
      <AcuTextarea
        :id="`acu-requirement-${editorId}-${index}`"
        :model-value="item"
        :rows="2"
        :disabled="disabled || saving"
        placeholder="Nhập một yêu cầu của người dùng"
        @update:model-value="updateItem(index, $event)"
      />
      <AcuButton size="sm" variant="danger" :disabled="disabled || saving" @click="removeItem(index)">Xóa thẻ</AcuButton>
    </div>
    <div class="acu-requirements-editor__actions">
      <AcuButton :disabled="disabled || saving" @click="emit('update:items', [...items, ''])">Thêm thẻ</AcuButton>
      <span class="acu-requirements-editor__spacer" />
      <AcuButton :disabled="disabled || saving || !dirty" @click="emit('discard')">Bỏ thay đổi</AcuButton>
      <AcuButton variant="primary" :loading="saving" :disabled="disabled || !dirty" @click="emit('save')">Lưu yêu cầu người dùng</AcuButton>
    </div>
    <p v-if="error" role="alert" class="acu-requirements-editor__error">{{ error }}</p>
  </section>
</template>

<script setup lang="ts">
import AcuButton from './_lib/AcuButton.vue';
import AcuTextarea from './_lib/AcuTextarea.vue';

const props = withDefaults(defineProps<{
  items: readonly string[];
  dirty: boolean;
  error?: string;
  saving?: boolean;
  disabled?: boolean;
  editorId: string;
}>(), { error: '', saving: false, disabled: false });
const emit = defineEmits<{
  (event: 'update:items', items: string[]): void;
  (event: 'save' | 'discard'): void;
}>();

function updateItem(index: number, text: string): void {
  const next = [...props.items];
  next[index] = text;
  emit('update:items', next);
}
function removeItem(index: number): void {
  emit('update:items', props.items.filter((_item, position) => position !== index));
}
</script>

<style scoped>
.acu-requirements-editor { display: grid; gap: 10px; }
.acu-requirements-editor__hint { margin: 0; color: var(--acu-text-3); font-size: var(--acu-font-size-body, 12px); }
.acu-requirements-editor__row { display: grid; gap: 6px; padding: 10px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 20%, transparent); border-radius: 7px; }
.acu-requirements-editor__row label { color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); }
.acu-requirements-editor__row button { justify-self: end; }
.acu-requirements-editor__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.acu-requirements-editor__spacer { flex: 1; }
.acu-requirements-editor__error { margin: 0; color: var(--acu-danger, #d65b5b); font-size: var(--acu-font-size-body, 12px); }
</style>
