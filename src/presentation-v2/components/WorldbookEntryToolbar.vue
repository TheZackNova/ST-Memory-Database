<template>
  <div class="acu-v2-wb-entry-toolbar">
    <template v-if="showEntrySelectionControls">
      <AcuButton @click="$emit('select-all')">Chọn tất cả</AcuButton>
      <AcuButton @click="$emit('deselect-all')">Bỏ chọn tất cả</AcuButton>
    </template>
    <template v-if="showSkillifyControls">
      <AcuButton @click="$emit('skillify-select-all')">Chọn tất cả Skill</AcuButton>
      <AcuButton @click="$emit('skillify-deselect-all')">Bỏ chọn tất cả Skill</AcuButton>
      <AcuButton variant="primary" @click="$emit('skillify-selected')">Skill hóa mục đã chọn</AcuButton>
    </template>
    <AcuFormRow class="acu-v2-wb-entry-toolbar__filter">
      <AcuInput
        :model-value="filter"
        type="text"
        placeholder="Tìm mục..."
        @update:model-value="$emit('update:filter', String($event))"
      />
    </AcuFormRow>
  </div>
</template>

<script setup lang="ts">
import AcuButton from './_lib/AcuButton.vue';
import AcuFormRow from './_lib/AcuFormRow.vue';
import AcuInput from './_lib/AcuInput.vue';

withDefaults(defineProps<{
  filter: string;
  showEntrySelectionControls?: boolean;
  showSkillifyControls?: boolean;
}>(), {
  showEntrySelectionControls: true,
  showSkillifyControls: false,
});

defineEmits<{
  (e: 'update:filter', value: string): void;
  (e: 'select-all'): void;
  (e: 'deselect-all'): void;
  (e: 'skillify-select-all'): void;
  (e: 'skillify-deselect-all'): void;
  (e: 'skillify-selected'): void;
}>();
</script>

<style scoped>
.acu-v2-wb-entry-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  flex-wrap: wrap;
}

.acu-v2-wb-entry-toolbar__filter {
  flex: 1;
  min-width: 160px;
}
</style>
