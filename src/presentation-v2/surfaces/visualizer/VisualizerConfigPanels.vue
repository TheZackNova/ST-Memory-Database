<template>
  <div class="acu-viz-config" data-acu-visualizer-config>
    <AcuPanel
      title="Thông tin cơ bản và định nghĩa cột"
      description="Sửa tên bảng và tên cột tại đây. AI hiểu các trường theo những tên này; nếu kết quả điền bảng nhầm trường, hãy kiểm tra ở đây trước."
    >
      <div class="acu-viz-config__grid">
        <AcuFormRow label="Tên bảng">
          <AcuInput
            :model-value="config.currentSheet.value?.name || ''"
            @update:model-value="config.renameSheet"
          />
        </AcuFormRow>
        <AcuFormRow label="Preset API cấp bảng">
          <AcuSelect
            :model-value="config.currentTableApiPreset.value"
            :options="config.apiPresetOptions.value"
            @update:model-value="config.setTableApiPreset"
          />
        </AcuFormRow>
      </div>

      <div class="acu-viz-config__columns">
        <article
          v-for="column in config.visibleColumnEntries.value"
          :key="`column-${column.columnIndex}`"
          class="acu-viz-config__column-row"
        >
          <span class="acu-viz-config__column-index">#{{ column.columnIndex + 1 }}</span>
          <AcuInput
            :model-value="column.header"
            @update:model-value="value => config.updateHeader(column.columnIndex, value)"
          />
          <AcuIconButton
            icon="fa-solid fa-trash"
            size="sm"
            variant="danger"
            title="Xóa cột"
            @click="$emit('request-delete-column', column.columnIndex)"
          />
        </article>
        <p v-if="config.visibleColumnEntries.value.length === 0" class="acu-viz-config__empty">
          Bảng hiện tại không có cột nào để sửa. Sau khi thêm cột, các hàng dữ liệu có sẵn sẽ tự động được bổ sung một giá trị rỗng.
        </p>
        <div class="acu-viz-config__column-operation">
          <AcuButton size="sm" variant="primary" @click="$emit('request-add-column')">
            <i class="fa-solid fa-plus"></i>
            Thêm cột
          </AcuButton>
        </div>
      </div>
    </AcuPanel>

    <AcuPanel
      title="Tham số cập nhật tự động"
      description="Chỉnh phạm vi và tần suất cập nhật tự động của bảng hiện tại tại đây. Khi không chắc dùng -1; muốn tắt cập nhật tự động của bảng hiện tại thì đặt tần suất cập nhật là 0."
    >
      <div class="acu-viz-config__grid acu-viz-config__grid--three">
        <AcuFormRow label="Số tầng ngữ cảnh">
          <AcuInput
            type="number"
            :model-value="updateConfig.contextDepth"
            :min="-1"
            :step="1"
            @update:model-value="value => config.updateUpdateConfig('contextDepth', value)"
          />
        </AcuFormRow>
        <AcuFormRow label="Tần suất cập nhật">
          <AcuInput
            type="number"
            :model-value="updateConfig.updateFrequency"
            :min="-1"
            :step="1"
            @update:model-value="value => config.updateUpdateConfig('updateFrequency', value)"
          />
        </AcuFormRow>
        <AcuFormRow label="Kích thước lô xử lý">
          <AcuInput
            type="number"
            :model-value="updateConfig.batchSize"
            :min="-1"
            :step="1"
            @update:model-value="value => config.updateUpdateConfig('batchSize', value)"
          />
        </AcuFormRow>
        <AcuFormRow label="Số nhóm">
          <AcuInput
            type="number"
            :model-value="updateConfig.groupId"
            :min="-1"
            :step="1"
            @update:model-value="value => config.updateUpdateConfig('groupId', value)"
          />
        </AcuFormRow>
        <AcuFormRow label="Bỏ qua tầng">
          <AcuInput
            type="number"
            :model-value="updateConfig.skipFloors"
            :min="-1"
            :step="1"
            @update:model-value="value => config.updateUpdateConfig('skipFloors', value)"
          />
        </AcuFormRow>
        <AcuFormRow label="Số hàng mới nhất gửi đi">
          <AcuInput
            type="number"
            :model-value="updateConfig.sendLatestRows"
            :min="-1"
            :step="1"
            @update:model-value="value => config.updateUpdateConfig('sendLatestRows', value)"
          />
        </AcuFormRow>
      </div>
      <AcuFormRow
        v-if="config.isSQLite.value"
        label="Mẫu dữ liệu gửi khi điền bảng"
        hint="Tính năng nâng cao: chỉ thay phần “dữ liệu hiện tại” gửi cho AI điền bảng. Nên SELECT thẳng row_id và các trường cần thiết; hệ thống sẽ mở kết quả nhiều cột thành các dòng bản ghi dạng “trường: giá trị”. Để trống thì tiếp tục dùng “Số hàng mới nhất gửi đi”."
      >
        <AcuTextarea
          :model-value="updateConfig.sendRowsSqlTemplate"
          :rows="6"
          auto-resize
          :placeholder="sendRowsSqlTemplatePlaceholder"
          @update:model-value="value => config.updateUpdateConfig('sendRowsSqlTemplate', value)"
        />
      </AcuFormRow>
    </AcuPanel>

    <AcuPanel
      title="Prompt kích hoạt AI"
      description="Viết mô tả bảng và từ kích hoạt thêm/sửa/xóa cho AI tại đây. Khi AI không thêm, cập nhật hoặc xóa như mong đợi, hãy kiểm tra các văn bản này có rõ ràng không."
    >
      <div class="acu-viz-config__prompts">
        <AcuFormRow label="Mô tả bảng">
          <AcuTextarea
            :model-value="sourceData.note"
            :rows="3"
            auto-resize
            @update:model-value="value => config.updateSourceData('note', value)"
          />
        </AcuFormRow>
        <AcuFormRow label="Kích hoạt khởi tạo">
          <AcuTextarea
            :model-value="sourceData.initNode"
            :rows="2"
            auto-resize
            @update:model-value="value => config.updateSourceData('initNode', value)"
          />
        </AcuFormRow>
        <AcuFormRow label="Kích hoạt thêm">
          <AcuTextarea
            :model-value="sourceData.insertNode"
            :rows="2"
            auto-resize
            @update:model-value="value => config.updateSourceData('insertNode', value)"
          />
        </AcuFormRow>
        <AcuFormRow label="Kích hoạt cập nhật">
          <AcuTextarea
            :model-value="sourceData.updateNode"
            :rows="2"
            auto-resize
            @update:model-value="value => config.updateSourceData('updateNode', value)"
          />
        </AcuFormRow>
        <AcuFormRow label="Kích hoạt xóa">
          <AcuTextarea
            :model-value="sourceData.deleteNode"
            :rows="2"
            auto-resize
            @update:model-value="value => config.updateSourceData('deleteNode', value)"
          />
        </AcuFormRow>
      </div>
    </AcuPanel>

    <AcuPanel
      v-if="config.isSQLite.value"
      title="Định nghĩa DDL"
      description="Bảng SQLite duy trì câu lệnh tạo bảng tại đây. Khi tiêu đề cột và CREATE TABLE không khớp, SQL có thể báo lỗi hoặc ghi nhầm cột."
    >
      <AcuFormRow label="Câu lệnh CREATE TABLE">
        <AcuTextarea
          class="acu-viz-config__ddl"
          :model-value="sourceData.ddl"
          :rows="7"
          auto-resize
          @update:model-value="value => config.updateSourceData('ddl', value)"
        />
      </AcuFormRow>
      <div class="acu-viz-config__inline-actions">
        <AcuButton size="sm" @click="validateDDL">
          <i class="fa-solid fa-check-circle"></i>
          Kiểm tra DDL
        </AcuButton>
        <AcuBadge v-if="ddlValidation" :variant="ddlValidation.valid ? 'accent' : 'warning'">
          {{ ddlValidation.message }}
        </AcuBadge>
      </div>
    </AcuPanel>

    <AcuPanel
      title="Cấu hình chèn vào Sổ thế giới"
      description="Điều khiển bảng này có vào Sổ thế giới không, được ghi thành những mục nào và đặt ở vị trí nào. Kiểm tra ở đây khi nội dung Sổ thế giới thiếu, trùng lặp hoặc sai vị trí."
    >
      <div class="acu-viz-config__toggles">
        <AcuCheckbox
          :model-value="exportConfig.injectIntoWorldbook !== false"
          label="Chèn vào mục Sổ thế giới"
          @update:model-value="value => config.updateExportConfig('injectIntoWorldbook', value)"
        />
        <AcuCheckbox
          :model-value="exportConfig.enabled === true"
          label="Bật xuất độc lập"
          @update:model-value="value => config.updateExportConfig('enabled', value)"
        />
      </div>

      <AcuFormRow v-if="config.isSQLite.value" label="Mẫu chèn SQL">
        <AcuTextarea
          :model-value="exportConfig.sqlInjectionTemplate || ''"
          :rows="5"
          auto-resize
          :placeholder="sqlInjectionTemplatePlaceholder"
          @update:model-value="value => config.updateExportConfig('sqlInjectionTemplate', value)"
        />
      </AcuFormRow>

      <template v-if="exportConfig.enabled === true">
        <div class="acu-viz-config__toggles">
          <AcuCheckbox
            :model-value="exportConfig.splitByRow === true"
            label="Tách mục độc lập theo hàng"
            @update:model-value="value => config.updateExportConfig('splitByRow', value)"
          />
          <AcuCheckbox
            :model-value="exportConfig.preventRecursion !== false"
            label="Ngăn kích hoạt đệ quy"
            @update:model-value="value => config.updateExportConfig('preventRecursion', value)"
          />
        </div>

        <div class="acu-viz-config__grid">
          <AcuFormRow label="Tên mục">
            <AcuInput
              :model-value="exportConfig.entryName || ''"
              @update:model-value="value => config.updateExportConfig('entryName', value)"
            />
          </AcuFormRow>
          <AcuFormRow label="Loại mục">
            <AcuSelect
              :model-value="exportConfig.entryType || 'constant'"
              :options="config.entryTypeOptions"
              @update:model-value="value => config.updateExportConfig('entryType', value)"
            />
          </AcuFormRow>
          <AcuFormRow label="Từ khóa">
            <AcuInput
              :model-value="exportConfig.keywords || ''"
              @update:model-value="value => config.updateExportConfig('keywords', value)"
            />
          </AcuFormRow>
        </div>

        <AcuFormRow label="Mẫu chèn tùy chỉnh">
          <AcuTextarea
            :model-value="exportConfig.injectionTemplate || ''"
            :rows="3"
            @update:model-value="value => config.updateExportConfig('injectionTemplate', value)"
          />
        </AcuFormRow>

        <PlacementEditor
          title="Vị trí mục chính"
          :placement="config.getPlacement('entryPlacement')"
          :options="config.placementOptions"
          :update-field="(field, value) => config.updatePlacement('entryPlacement', field, value)"
        />

        <div class="acu-viz-config__subsection">
          <AcuCheckbox
            :model-value="exportConfig.extraIndexEnabled === true"
            label="Thêm mục chỉ mục bổ sung"
            @update:model-value="value => config.updateExportConfig('extraIndexEnabled', value)"
          />
          <template v-if="exportConfig.extraIndexEnabled">
            <div class="acu-viz-config__grid">
              <AcuFormRow label="Tên mục chỉ mục">
                <AcuInput
                  :model-value="exportConfig.extraIndexEntryName || ''"
                  @update:model-value="value => config.updateExportConfig('extraIndexEntryName', value)"
                />
              </AcuFormRow>
            </div>
            <AcuFormRow label="Mẫu mục chỉ mục">
              <AcuTextarea
                :model-value="exportConfig.extraIndexInjectionTemplate || ''"
                :rows="3"
                @update:model-value="value => config.updateExportConfig('extraIndexInjectionTemplate', value)"
              />
            </AcuFormRow>
            <div class="acu-viz-config__column-modes">
              <article
                v-for="column in config.visibleColumnEntries.value"
                :key="`extra-index-column-${column.columnIndex}`"
                class="acu-viz-config__column-mode"
              >
                <AcuCheckbox
                  :model-value="extraIndexColumns.includes(column.header)"
                  :label="column.header"
                  @update:model-value="value => config.setExtraIndexColumn(column.header, value)"
                />
                <AcuSelect
                  size="sm"
                  :disabled="!extraIndexColumns.includes(column.header)"
                  :model-value="extraIndexColumnModes[column.header] === 'index_only' ? 'index_only' : 'both'"
                  :options="config.extraIndexModeOptions"
                  @update:model-value="value => config.setExtraIndexColumnMode(column.header, value === 'index_only' ? 'index_only' : 'both')"
                />
              </article>
            </div>
            <PlacementEditor
              title="Vị trí mục chỉ mục"
              :placement="config.getPlacement('extraIndexPlacement')"
              :options="config.placementOptions"
              :update-field="(field, value) => config.updatePlacement('extraIndexPlacement', field, value)"
            />
          </template>
        </div>
      </template>
    </AcuPanel>

    <AcuPanel
      v-if="config.fixedConfigEnabled.value"
      title="Cấu hình chèn mục cố định"
      description="Điều khiển vị trí của các mục cố định như 总结表, 总体大纲, 重要人物表. Kiểm tra ở đây khi mục cố định bị trùng hoặc sai thứ tự."
    >
      <PlacementEditor
        title="Vị trí mục chính cố định"
        :placement="config.getPlacement('fixedEntryPlacement')"
        :options="config.placementOptions"
        :update-field="(field, value) => config.updatePlacement('fixedEntryPlacement', field, value)"
      />
      <PlacementEditor
        v-if="config.importantPersonsFixedIndexEnabled.value"
        title="Vị trí mục chỉ mục cố định"
        :placement="config.getPlacement('fixedIndexPlacement')"
        :options="config.placementOptions"
        :update-field="(field, value) => config.updatePlacement('fixedIndexPlacement', field, value)"
      />
    </AcuPanel>

    <AcuPanel
      v-if="config.specialIndex.value.enabled"
      title="Tự động đánh số chỉ mục mã"
      description="Dùng để duy trì các mã dạng AM0001 trong 总结表, 总体大纲. Khi bật sẽ tự động sắp xếp lại; khi tắt bạn phải tự giữ tính duy nhất và thứ tự."
    >
      <div class="acu-viz-config__toggles">
        <AcuCheckbox
          :model-value="config.specialIndex.value.locked"
          label="Tự động sắp xếp lại mã khi lưu và khi AI cập nhật"
          @update:model-value="config.setSpecialIndexLock"
        />
        <AcuBadge :variant="config.specialIndex.value.index >= 0 ? 'neutral' : 'warning'">
          {{ specialIndexLabel }}
        </AcuBadge>
      </div>
    </AcuPanel>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import AcuBadge from '../../components/_lib/AcuBadge.vue';
import AcuButton from '../../components/_lib/AcuButton.vue';
import AcuCheckbox from '../../components/_lib/AcuCheckbox.vue';
import AcuFormRow from '../../components/_lib/AcuFormRow.vue';
import AcuIconButton from '../../components/_lib/AcuIconButton.vue';
import AcuInput from '../../components/_lib/AcuInput.vue';
import AcuPanel from '../../components/_lib/AcuPanel.vue';
import AcuSelect from '../../components/_lib/AcuSelect.vue';
import AcuTextarea from '../../components/_lib/AcuTextarea.vue';
import { useVisualizerConfigEditing } from '../../composables/visualizer/useVisualizerConfigEditing';
import { parseDDLColumnNames } from '../../../shared/ddl-utils';
import PlacementEditor from './VisualizerPlacementEditor.vue';

defineEmits<{
  (e: 'request-add-column'): void;
  (e: 'request-delete-column', index: number): void;
}>();

const config = useVisualizerConfigEditing();
const ddlValidation = ref<{ valid: boolean; message: string } | null>(null);
const sqlInjectionTemplatePlaceholder = 'Để trống thì dùng nội dung bảng mặc định. Hỗ trợ {[sql "SELECT ..."]} / {[db.ten_bang.where(...).get(...)]}, sẽ được ghi nguyên vào Sổ thế giới và mở ra trước khi gửi.';

const updateConfig = computed(() => {
  const raw = config.currentSheet.value?.updateConfig || {};
  return {
    contextDepth: Number.isFinite(raw.contextDepth) ? raw.contextDepth : -1,
    updateFrequency: Number.isFinite(raw.updateFrequency) ? raw.updateFrequency : -1,
    batchSize: Number.isFinite(raw.batchSize) ? raw.batchSize : -1,
    groupId: Number.isFinite(raw.groupId) ? raw.groupId : -1,
    skipFloors: Number.isFinite(raw.skipFloors) ? raw.skipFloors : -1,
    sendLatestRows: Number.isFinite(raw.sendLatestRows) ? raw.sendLatestRows : -1,
    sendRowsSqlTemplate: String(raw.sendRowsSqlTemplate || ''),
  };
});

const sourceData = computed(() => {
  const raw = config.currentSheet.value?.sourceData || {};
  return {
    note: String(raw.note || ''),
    initNode: String(raw.initNode || ''),
    insertNode: String(raw.insertNode || ''),
    updateNode: String(raw.updateNode || ''),
    deleteNode: String(raw.deleteNode || ''),
    ddl: String(raw.ddl || ''),
  };
});

const sendRowsSqlTemplatePlaceholder = computed(() => {
  const ddlColumns = parseDDLColumnNames(sourceData.value.ddl);
  const headers = ddlColumns.length > 0
    ? ddlColumns
    : (config.headers.value.length > 0 ? ['row_id', ...config.headers.value] : ['row_id']);
  const tableNameMatch = String(sourceData.value.ddl || '').match(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([^\s(]+)/i);
  const tableName = tableNameMatch?.[1] || 'your_table';
  return [
    `Cột nên truy vấn: ${headers.join(', ')}`,
    `Ví dụ định dạng mở rộng: row_id: 1, ${headers.slice(1).map((header, index) => `${header}: giá trị ${index + 1}`).join(', ')}`,
    '',
    'Mẫu ví dụ:',
    `{[sql "SELECT ${headers.join(', ')} FROM ${tableName} ORDER BY row_id ASC LIMIT 10"]}`,
  ].join('\n');
});

const exportConfig = computed(() => config.exportConfig.value || {});
const extraIndexColumns = computed<string[]>(() =>
  Array.isArray(exportConfig.value.extraIndexColumns) ? exportConfig.value.extraIndexColumns : [],
);
const extraIndexColumnModes = computed<Record<string, string>>(() =>
  exportConfig.value.extraIndexColumnModes && typeof exportConfig.value.extraIndexColumnModes === 'object'
    ? exportConfig.value.extraIndexColumnModes
    : {},
);

const specialIndexLabel = computed(() => {
  const info = config.specialIndex.value;
  if (info.index < 0) return 'Chưa nhận diện được cột chỉ mục mã, sẽ xử lý theo cách mặc định';
  return `Cột đã nhận diện: #${info.index + 1} ${info.header || 'Cột chưa đặt tên'}`;
});

function validateDDL(): void {
  ddlValidation.value = config.validateDDL();
}
</script>

<style scoped>
.acu-viz-config {
  min-width: 0;
  display: grid;
  gap: 12px;
}

.acu-viz-config__grid {
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.acu-viz-config__grid--three {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.acu-viz-config__columns,
.acu-viz-config__prompts,
.acu-viz-config__toggles,
.acu-viz-config__subsection,
.acu-viz-config__column-modes {
  min-width: 0;
  display: grid;
  gap: 10px;
}

.acu-viz-config__columns {
  margin-top: 12px;
}

.acu-viz-config__column-operation {
  display: flex;
  justify-content: flex-end;
  padding-top: 2px;
}

.acu-viz-config__column-row {
  min-width: 0;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  background: var(--acu-bg-0);
}

.acu-viz-config__column-index {
  color: var(--acu-text-3);
  font-family: var(--acu-font-mono);
  font-size: var(--acu-font-size-body, 12px);
  text-align: right;
}

.acu-viz-config__empty {
  margin: 0;
  color: var(--acu-text-2);
  font-size: var(--acu-font-size-body-lg, 13px);
  line-height: 1.55;
}

.acu-viz-config__inline-actions,
.acu-viz-config__column-mode {
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.acu-viz-config__inline-actions {
  margin-top: 10px;
}

.acu-viz-config__ddl {
  font-family: var(--acu-font-mono);
}

.acu-viz-config__column-mode {
  padding: 8px;
  border: 1px solid var(--acu-border);
  border-radius: var(--acu-radius-sm);
  background: var(--acu-bg-0);
}

.acu-viz-config__column-mode :deep(.acu-checkbox) {
  flex: 1 1 220px;
}

.acu-viz-config__column-mode :deep(.acu-select) {
  flex: 1 1 260px;
}

@media (max-width: 860px) {
  .acu-viz-config__grid,
  .acu-viz-config__grid--three {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 767px) {
  .acu-viz-config__column-operation {
    justify-content: stretch;
  }

  .acu-viz-config__column-operation :deep(.acu-btn) {
    width: 100%;
  }
}

@media (max-width: 520px) {
  .acu-viz-config__column-row {
    grid-template-columns: 34px minmax(0, 1fr) auto;
    padding: 7px;
  }
}
</style>
