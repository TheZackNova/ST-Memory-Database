<template>
  <div class="acu-viz-global" data-acu-visualizer-global>
    <AcuPanel
      title="Cấu hình chèn toàn cục"
      description="Cấu hình toàn cục thuộc về cả bộ mẫu, không gắn với một bảng riêng. Nó điều khiển vị trí chèn của mục dữ liệu có thể đọc và mục bọc bên ngoài; nếu nội dung Sổ thế giới của tất cả các bảng bị sai vị trí tổng thể, hãy kiểm tra bảng này trước."
    >
      <PlacementEditor
        title="Vị trí mục dữ liệu có thể đọc"
        :placement="config.getGlobalPlacement('readableEntryPlacement')"
        :options="config.placementOptions"
        :update-field="(field, value) => config.updateGlobalPlacement('readableEntryPlacement', field, value)"
      />

      <PlacementEditor
        title="Vị trí mục bọc"
        :placement="config.getGlobalPlacement('wrapperPlacement')"
        :options="config.placementOptions"
        :update-field="(field, value) => config.updateGlobalPlacement('wrapperPlacement', field, value)"
      />
    </AcuPanel>
  </div>
</template>

<script setup lang="ts">
import AcuPanel from '../../components/_lib/AcuPanel.vue';
import { useVisualizerConfigEditing } from '../../composables/visualizer/useVisualizerConfigEditing';
import PlacementEditor from './VisualizerPlacementEditor.vue';

const config = useVisualizerConfigEditing();
</script>

<style scoped>
.acu-viz-global {
  min-width: 0;
  display: grid;
  gap: 12px;
}

</style>
