<template>
  <div class="acu-v2-wb-selector">
    <AcuFormRow v-if="filterable" label="Lọc">
      <AcuInput v-model="filter" type="text" placeholder="Lọc Sổ thế giới..." />
    </AcuFormRow>
    <AcuFormRow label="Sổ thế giới đích">
      <AcuSelect
        :options="worldbookOptions"
        :model-value="modelValue"
        :disabled="status === 'loading'"
        placeholder="Chưa chọn"
        @update:model-value="$emit('update:modelValue', $event)"
      />
    </AcuFormRow>
    <AcuText v-if="status === 'error'" variant="error" class="acu-v2-wb-selector__error">{{ error || 'Tải thất bại' }}</AcuText>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AcuFormRow from './_lib/AcuFormRow.vue';
import AcuInput from './_lib/AcuInput.vue';
import AcuSelect from './_lib/AcuSelect.vue';
import type { AcuSelectOption } from './_lib/AcuSelect.vue';
import AcuText from './_lib/AcuText.vue';
import type { WorldbookLoadStatus } from '../composables/useWorldbookSelector';

const props = defineProps<{
  modelValue: string;
  names: string[];
  charPrimary: string | null;
  status: WorldbookLoadStatus;
  error: string;
  filterable?: boolean;
  showCharacterOption?: boolean;
  characterOptionLabel?: string;
  characterFallbackLabel?: string;
}>();

defineEmits<{
  (e: 'update:modelValue', value: string): void;
}>();

const filter = ref('');

const filteredNames = computed<string[]>(() => {
  const list = props.names;
  const f = filter.value.trim().toLowerCase();
  if (!f) return list;
  return list.filter(name => name.toLowerCase().includes(f));
});

const worldbookOptions = computed<AcuSelectOption[]>(() => {
  const result: AcuSelectOption[] = [];
  if (props.charPrimary || props.showCharacterOption) {
    const label = props.characterOptionLabel
      || (props.charPrimary ? `Sổ thế giới chính của thẻ nhân vật hiện tại · ${props.charPrimary}` : props.characterFallbackLabel || 'Sổ thế giới chính của thẻ nhân vật hiện tại');
    result.push({ value: 'character', label });
  }
  for (const name of filteredNames.value) {
    result.push({ value: name, label: name });
  }
  return result;
});
</script>

<style scoped>
.acu-v2-wb-selector { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
</style>
