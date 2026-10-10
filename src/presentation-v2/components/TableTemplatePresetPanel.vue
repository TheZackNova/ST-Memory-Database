<template>
  <AcuPanel
    :title="tableCopy.panels.templatePreset.title"
    :description="tableCopy.panels.templatePreset.description"
  >
    <AcuMessage v-if="templates.message.value" :kind="templates.message.value.kind">
      {{ templates.message.value.text }}
    </AcuMessage>
    <AcuMessage v-if="management.message.value" :kind="management.message.value.kind">
      {{ management.message.value.text }}
    </AcuMessage>

    <AcuText variant="status-line" class="acu-table-template-panel__status-line">
      Cuộc trò chuyện hiện tại: <strong class="acu-text__value">{{ templates.selectedChatPresetLabel.value }}</strong>
      <template v-if="templates.selectedGlobalPreset.value"> · Mặc định toàn cục: <strong class="acu-text__value">{{ templates.selectedGlobalPreset.value }}</strong></template>
      <template v-else> · Mặc định toàn cục: <strong class="acu-text__value">Preset mặc định</strong></template>
      <AcuBadge :variant="templates.isChatOverridden.value ? 'accent' : 'neutral'">
        {{ templates.isChatOverridden.value ? 'Đã ghi đè' : 'Theo toàn cục' }}
      </AcuBadge>
    </AcuText>

    <div class="acu-table-template-panel__preset-row">
      <AcuPresetDropdown
        :items="templates.chatPresetItems.value"
        :model-value="templates.selectedChatPreset.value"
        :default-name="templates.selectedGlobalPresetValue.value"
        :disabled="templates.busy.value || management.busy.value"
        placeholder="Preset mặc định"
        @update:model-value="templates.selectChatPreset($event)"
        @set-default="templates.selectGlobalPreset($event)"
      />
      <AcuFileButton
        icon-only
        title="Nhập JSON mẫu"
        accept="application/json,.json"
        :disabled="templates.busy.value || management.busy.value"
        @file="templates.importPresetForCurrentChat($event)"
      >
        <i class="fa-solid fa-download"></i>
      </AcuFileButton>
      <AcuIconButton
        icon="fa-solid fa-upload"
        title="Xuất mẫu đang có hiệu lực"
        :disabled="templates.busy.value || management.busy.value || !templates.runtimeTemplateAvailable.value"
        @click="templates.exportTemplate('runtime')"
      />
      <AcuIconButton
        icon="fa-solid fa-clock-rotate-left"
        title="Khôi phục bản lưu trữ mẫu cũ"
        :disabled="templates.busy.value || management.busy.value || templates.chatArchiveItems.value.length === 0"
        @click="templates.restoreArchivedChatTemplate"
      />
      <AcuIconButton
        v-if="templates.isChatOverridden.value"
        icon="fa-solid fa-link-slash"
        title="Theo toàn cục (xóa ghi đè của cuộc trò chuyện)"
        :disabled="templates.busy.value || management.busy.value"
        @click="templates.followGlobalTemplate"
      />
      <AcuIconButton
        icon="fa-solid fa-gear"
        title="Quản lý preset mẫu bảng"
        :disabled="management.busy.value"
        @click="management.openManage"
      />
    </div>

    <div class="acu-table-template-panel__action-area">
      <AcuButton
        variant="primary"
        class="acu-table-template-panel__visualizer-button"
        title="Mở trình chỉnh sửa bảng trực quan"
        :disabled="templates.busy.value || management.busy.value"
        @click="management.openVisualizer"
      >
        <i class="fa-solid fa-table-columns"></i>
        Mở trình chỉnh sửa bảng trực quan
      </AcuButton>
    </div>

    <TablePresetDrawer
      :is-open="management.isDrawerOpen.value"
      :title="management.title.value"
      :busy="management.busy.value"
      :message="management.message.value"
      :preset-meta="management.presetMeta.value"
      :default-preset-name="management.defaultPresetName.value"
      @close="management.closeDrawer"
      @create-blank="management.createBlankPreset"
      @set-default="management.setAsDefault($event)"
      @export="management.exportPreset($event)"
      @rename="management.renamePreset($event)"
      @edit="management.editPreset($event)"
      @delete="management.deletePreset($event)"
    />
  </AcuPanel>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue';
import AcuBadge from './_lib/AcuBadge.vue';
import AcuButton from './_lib/AcuButton.vue';
import AcuFileButton from './_lib/AcuFileButton.vue';
import AcuMessage from './_lib/AcuMessage.vue';
import AcuIconButton from './_lib/AcuIconButton.vue';
import AcuPanel from './_lib/AcuPanel.vue';
import AcuPresetDropdown from './_lib/AcuPresetDropdown.vue';
import AcuText from './_lib/AcuText.vue';
import TablePresetDrawer from './TablePresetDrawer.vue';
import { useChatChangedTick } from '../composables/useChatChangedListener';
import { useTemplateRuntimeChangeTick } from '../composables/useTemplateRuntimeChangeListener';
import { useTablePresetManagement } from '../composables/useTablePresetManagement';
import { useTableTemplatePresets } from '../composables/useTableTemplatePresets';
import { tableCopy } from '../copy/table-copy';

const templates = useTableTemplatePresets();
const management = useTablePresetManagement();

function refreshAll(): void {
  templates.refresh();
  management.refresh();
}

onMounted(refreshAll);
watch(useChatChangedTick(), refreshAll);
watch(useTemplateRuntimeChangeTick(), refreshAll);
</script>

<style scoped>
.acu-table-template-panel__status-line {
  margin: 0 0 10px;
  font-size: var(--acu-font-size-body, 12px);
  line-height: var(--acu-line-height-body, 1.45);
}

.acu-table-template-panel__preset-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(4, max-content);
  gap: 6px;
  align-items: stretch;
  min-width: 0;
}

.acu-table-template-panel__action-area {
  margin-top: 10px;
}

.acu-table-template-panel__visualizer-button {
  width: 100%;
}

</style>
