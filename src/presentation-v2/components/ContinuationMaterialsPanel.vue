<template>
  <div class="acu-v2-continuation-materials">
    <div class="acu-v2-continuation-materials__tabs">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="acu-v2-continuation-materials__tab"
        :class="{ 'acu-v2-continuation-materials__tab--active': activeTab === tab.id }"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
      <div class="acu-v2-continuation-materials__tab-actions">
        <AcuButton :loading="busy" @click="reload()">Làm mới</AcuButton>
        <AcuButton variant="danger" :loading="busy" @click="requestClear">Xóa sạch một chạm</AcuButton>
      </div>
    </div>

    <p v-if="clearPending" class="acu-v2-continuation-materials__confirm">
      Xóa sạch sẽ xóa tác vụ viết tiếp hiện tại, bản ghi phiên của Agent chính và snapshot tài liệu cục bộ (phục bút, chênh lệch thông tin, ràng buộc dài hạn, tổng cương truyện, niên đại học, kho tư liệu bách khoa, yêu cầu người dùng).
      Các tầng nội dung tiểu thuyết không bị ảnh hưởng; sau khi xóa có thể lên kế hoạch lại từ cốt truyện hiện tại.
      <span class="acu-v2-continuation-materials__confirm-actions">
        <AcuButton variant="danger" :loading="busy" @click="confirmClear">Xác nhận xóa sạch</AcuButton>
        <AcuButton @click="clearPending = false">Hủy</AcuButton>
      </span>
    </p>

    <!-- 阶段大纲：当前阶段可编辑，历史阶段只读折叠 -->
    <template v-if="activeTab === 'outline'">
      <p v-if="!task" class="acu-v2-continuation-materials__empty">Chưa có tác vụ viết tiếp nên cũng chưa có dàn ý giai đoạn.</p>
      <template v-else>
        <div v-if="activeRevision && activeStage" class="acu-v2-continuation-materials__outline">
          <p class="acu-v2-continuation-materials__meta">
            Hiện tại: giai đoạn {{ activeStage?.stageNumber }} · revision {{ activeRevision.revision }} · đã xong {{ activeStage?.completedTurns ?? 0 }} lượt.
            Các lượt đã xong và đang thực thi không thể xóa hoặc thay thế; tổng số lượt phải nằm trong phạm vi quy mô giai đoạn.
          </p>

          <section class="acu-v2-continuation-materials__outline-summary">
            <p class="acu-v2-continuation-materials__outline-heading">
              <strong>Giai đoạn {{ activeStage.stageNumber }}: {{ activeRevision.outline.title }}</strong>
              <span class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--primary">{{ TEMPO_LABELS[activeRevision.outline.tempo] ?? activeRevision.outline.tempo }}</span>
              <span class="acu-v2-continuation-materials__badge">Vai trò: {{ ROLE_LABELS[activeRevision.outline.role ?? ''] ?? activeRevision.outline.role ?? 'Chưa đánh dấu' }}</span>
              <span class="acu-v2-continuation-materials__badge">revision {{ activeRevision.revision }}</span>
              <span class="acu-v2-continuation-materials__badge">{{ activeRevision.frozen ? 'Đã đóng băng' : 'Chờ xác nhận' }}</span>
            </p>
            <p class="acu-v2-continuation-materials__card-body">Mục tiêu giai đoạn: {{ activeRevision.outline.goal }}</p>
            <p class="acu-v2-continuation-materials__card-meta">Mục tiêu thời gian truyện: {{ activeRevision.outline.timeSpanGoal ?? 'Chưa đặt' }}</p>
            <p class="acu-v2-continuation-materials__card-meta">Xong {{ activeStage.completedTurns }} / {{ activeRevision.outline.totalTurns }} lượt · còn {{ remainingTurns(activeStage, activeRevision) }} lượt</p>
            <p class="acu-v2-continuation-materials__card-meta">
              Tập active thuộc về: {{ activeVolume ? `[${activeVolume.id}]「${activeVolume.title}」` : 'Chưa nhận diện (tổng cương truyện chưa tải hoặc hiện không có tập active)' }}
            </p>
          </section>

          <div class="acu-v2-continuation-materials__outline-nodes">
            <section v-for="(node, nodeIndex) in activeRevision.outline.nodes" :key="node.id" class="acu-v2-continuation-materials__outline-node">
              <p class="acu-v2-continuation-materials__card-head"><strong>{{ node.title }}</strong><span class="acu-v2-continuation-materials__badge">{{ node.turns.length }} lượt</span></p>
              <p class="acu-v2-continuation-materials__card-body">Mục tiêu nút: {{ node.goal }}</p>
              <ol class="acu-v2-continuation-materials__turns">
                <li
                  v-for="(turn, turnIndex) in node.turns"
                  :key="turn.id"
                  :class="`acu-v2-continuation-materials__turn--${turnState(activeRevision, nodeIndex, turnIndex)}`"
                >
                  <span>Lượt {{ turnPosition(activeRevision, node.id, turnIndex) }} · {{ turn.goal }}</span>
                  <span class="acu-v2-continuation-materials__badge">{{ PACING_LABELS[turn.pacing] ?? turn.pacing }}</span>
                  <span class="acu-v2-continuation-materials__badge">Chức năng: {{ FUNCTION_LABELS[turn.function ?? ''] ?? turn.function ?? 'Chưa đánh dấu' }}</span>
                  <span class="acu-v2-continuation-materials__badge">Tuyến chính: {{ MAINLINE_LABELS[turn.mainlineDelta ?? ''] ?? turn.mainlineDelta ?? 'Chưa đánh dấu' }}</span>
                  <span class="acu-v2-continuation-materials__badge">Thời gian: {{ TIME_LABELS[turn.timeAdvance ?? ''] ?? turn.timeAdvance ?? 'Chưa đánh dấu' }}<template v-if="turn.timeAnchor"> · {{ turn.timeAnchor }}</template></span>
                  <span v-if="turn.inferred?.length" class="acu-v2-continuation-materials__badge" title="Các trường này do hệ thống bổ sung thận trọng theo mức nhịp, không phải do mô hình dàn ý hoặc tác giả nêu rõ; có thể sửa trong JSON gốc">Hệ thống bổ sung: {{  turn.inferred.map(field => INFERRED_FIELD_LABELS[field] ?? field).join(', ') }}</span>
                  <span v-if="turnState(activeRevision, nodeIndex, turnIndex) === 'current'" class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--primary">Đang thực thi</span>
                </li>
              </ol>
            </section>
          </div>

          <details class="acu-v2-continuation-materials__json">
            <summary>Sửa JSON gốc</summary>
            <p class="acu-v2-continuation-materials__card-meta">Khi sửa mục tiêu lượt, hãy đối chiếu đồng thời pacing, function, mainlineDelta, timeAdvance và timeAnchor; các trường ngữ nghĩa còn thiếu khi lưu sẽ được bổ sung mặc định theo pacing và gắn nhãn «Hệ thống bổ sung»; trường đánh dấu inferred sau khi đổi sang giá trị rõ ràng thì nhãn tự biến mất.</p>
            <AcuTextarea :model-value="outlineDraft" :rows="16" @update:model-value="onOutlineInput" />
            <p v-if="outlineError" class="acu-v2-continuation-materials__error">{{ outlineError }}</p>
            <div class="acu-v2-continuation-materials__actions">
              <AcuButton :disabled="!outlineDirty" @click="syncOutlineDraft">Bỏ thay đổi</AcuButton>
              <AcuButton variant="primary" :loading="busy" :disabled="!outlineDirty" @click="saveOutline">Lưu dàn ý</AcuButton>
            </div>
          </details>
        </div>
        <p v-else class="acu-v2-continuation-materials__empty">Hiện không có dàn ý giai đoạn đã đóng băng để sửa.</p>

        <details
          v-for="stage in historyStages"
          :key="stage.stageId"
          class="acu-v2-continuation-materials__block"
          :open="expandedHistoryStageIds.has(stage.stageId)"
          @toggle="onHistoryStageToggle(stage.stageId, $event)"
        >
          <summary>Giai đoạn {{ stage.stageNumber }} · {{ stage.status }} · {{ stage.completedTurns }} / {{ stageTotalTurns(stage) }} lượt</summary>
          <template v-if="expandedHistoryStageIds.has(stage.stageId)">
          <template v-for="revision in [displayRevision(stage)]" :key="revision?.revision ?? 'no-revision'">
            <section v-if="revision" class="acu-v2-continuation-materials__outline-summary">
              <p class="acu-v2-continuation-materials__outline-heading"><strong>{{ revision.outline.title }}</strong><span class="acu-v2-continuation-materials__badge">revision {{ revision.revision }}</span><span class="acu-v2-continuation-materials__badge">{{ revision.frozen ? 'Đã đóng băng' : 'Chờ xác nhận' }}</span><span class="acu-v2-continuation-materials__badge">Vai trò: {{ ROLE_LABELS[revision.outline.role ?? ''] ?? revision.outline.role ?? 'Chưa đánh dấu' }}</span></p>
              <p class="acu-v2-continuation-materials__card-body">Mục tiêu giai đoạn: {{ revision.outline.goal }}</p>
              <ol class="acu-v2-continuation-materials__list">
                <li v-for="node in revision.outline.nodes" :key="node.id"><strong>{{ node.title }}</strong>: {{ node.goal }}<ol><li v-for="turn in node.turns" :key="turn.id">{{ turn.goal }} · {{ PACING_LABELS[turn.pacing] ?? turn.pacing }} · {{ FUNCTION_LABELS[turn.function ?? ''] ?? turn.function ?? 'Chưa đánh dấu' }} · tuyến chính {{ MAINLINE_LABELS[turn.mainlineDelta ?? ''] ?? turn.mainlineDelta ?? 'Chưa đánh dấu' }} · {{ TIME_LABELS[turn.timeAdvance ?? ''] ?? turn.timeAdvance ?? 'Chưa đánh dấu' }}<template v-if="turn.timeAnchor">({{ turn.timeAnchor }})</template></li></ol></li>
              </ol>
            </section>
            <p v-else class="acu-v2-continuation-materials__empty">Giai đoạn này không có revision để hiển thị.</p>
          </template>
          <details v-if="olderRevisions(stage).length" class="acu-v2-continuation-materials__history">
            <summary>Revision cũ ({{ olderRevisions(stage).length }})</summary>
            <details v-for="revision in olderRevisions(stage)" :key="revision.revision" class="acu-v2-continuation-materials__history-revision">
              <summary>revision {{ revision.revision }} · {{ revision.reason }} · {{ revision.outline.title }}</summary>
              <ol class="acu-v2-continuation-materials__list"><li v-for="node in revision.outline.nodes" :key="node.id"><strong>{{ node.title }}</strong>: {{ node.goal }}</li></ol>
            </details>
          </details>
          </template>
        </details>
      </template>
    </template>

    <!-- 本地资料：伏笔 / 信息差 / 长期约束 分类型结构化展示，各自独立 JSON 编辑与保存 -->
    <template v-else-if="activeTab === 'modules'">
      <p class="acu-v2-continuation-materials__meta">
        Tài liệu cục bộ do Agent phụ kết toán và ghi, cũng có thể sửa thủ công theo từng mô-đun tại đây. Khi lưu sẽ qua cùng bước kiểm tra cấu trúc như Agent phụ và tăng số sửa đổi;
        mỗi mô-đun lưu độc lập, chỉ gửi dữ liệu của mô-đun đó, không ảnh hưởng mô-đun khác (kể cả bản nháp chưa lưu).
      </p>
      <p v-if="materials.snapshot.value" class="acu-v2-continuation-materials__meta">
        Mốc kết toán: tầng  {{ materials.snapshot.value.settledThroughIndex }} ·
        Phục bút {{ materials.snapshot.value.hooks.length }} mục ·
        Chênh lệch thông tin {{ materials.snapshot.value.infoGap.length }} mục ·
        Ràng buộc dài hạn {{ materials.snapshot.value.constraints.length }} mục ·
        Thời gian truyện {{ materials.snapshot.value.chronology.length }} mục ·
        Số sửa đổi {{ materials.snapshot.value.revisions.hooks }}/{{ materials.snapshot.value.revisions.infoGap }}/{{ materials.snapshot.value.revisions.constraints }}/{{ materials.snapshot.value.revisions.chronology }}
      </p>
      <p v-if="materials.snapshot.value" class="acu-v2-continuation-materials__meta">
        <template v-if="materials.diagnostics.value.checkpointIndex === null && materials.diagnostics.value.foldedDeltaCount === 0">
          Hiện không có baseline cũng không có delta theo tầng. Sau khi kết toán, delta sẽ được ghi vào tầng lúc đó; sau khi xóa tầng đó hoặc chuyển sang swipe khác, delta này không còn tham gia gộp.
        </template>
        <template v-else>
          Tài liệu được gộp từ baseline gần nhất; sau khi xóa tầng, delta của tầng đó cũng được hoàn lại theo.
          Tầng baseline {{ materials.diagnostics.value.checkpointIndex ?? 'Không' }} · đã gộp {{ materials.diagnostics.value.foldedDeltaCount }} delta.
          <template v-if="materials.diagnostics.value.salvaged">(Baseline không qua kiểm tra nghiêm ngặt, đã đọc theo chế độ khoan dung, bản ghi hỏng đã bị loại bỏ)</template>
          <template v-if="materials.diagnostics.value.candidates.some(item => !item.valid)">
            Ngoài ra có {{ materials.diagnostics.value.candidates.filter(item => !item.valid).length }} tầng bị bỏ qua do cấu trúc snapshot hỏng:
            <span v-for="item in materials.diagnostics.value.candidates.filter(entry => !entry.valid)" :key="item.index">Tầng {{ item.index }} ({{ item.problems.slice(0, 3).join('; ') }});</span>
          </template>
        </template>
      </p>
      <p v-if="materials.loadError.value" class="acu-v2-continuation-materials__error">{{ materials.loadError.value }}</p>

      <!-- 逐栏记录：按模块/ID 展示分栏视图；partial 只在这里可见，字段值不在这里展示 -->
      <details class="acu-v2-continuation-materials__block">
        <summary>Bản ghi theo cột · {{ fieldRecordTotal }} mục</summary>
        <p class="acu-v2-continuation-materials__meta">
          Bản ghi theo cột đến từ việc Agent phụ ghi từng cột: mục «Một phần» chưa ghi đủ cột bắt buộc, không vào tài liệu đầy đủ ở trên; mục «Mục snapshot cũ» đến từ snapshot nguyên mục cũ, nguồn không thể tách theo cột.
          Ở đây chỉ liệt kê tên cột và định danh sửa đổi; giá trị trường xem trong mục đầy đủ của từng mô-đun hoặc JSON gốc.
          <template v-if="materials.snapshot.value">
            Kết toán lượt này: {{ COMPLETION_STATE_LABELS[materials.snapshot.value.materialCompletion.state] ?? materials.snapshot.value.materialCompletion.state }}<template v-if="materials.snapshot.value.materialCompletion.rangeEndIndex >= 0"> · bao phủ tầng nội dung  {{ materials.snapshot.value.materialCompletion.rangeStartIndex }}–{{ materials.snapshot.value.materialCompletion.rangeEndIndex }}</template>。
          </template>
        </p>
        <p v-if="!fieldRecordGroups.length" class="acu-v2-continuation-materials__empty">Chưa có bản ghi ghi theo cột.</p>
        <details v-for="group in fieldRecordGroups" :key="group.module" class="acu-v2-continuation-materials__block">
          <summary>
            {{ group.label }} · {{ group.records.length }} mục
            <span v-if="group.completionLabel" class="acu-v2-continuation-materials__badge">Kết toán: {{ group.completionLabel }}</span>
          </summary>
          <div class="acu-v2-continuation-materials__cards">
            <div v-for="record in group.records" :key="record.id" class="acu-v2-continuation-materials__card">
              <p class="acu-v2-continuation-materials__card-head">
                <strong>{{ record.id }}</strong>
                <span
                  class="acu-v2-continuation-materials__badge"
                  :class="{ 'acu-v2-continuation-materials__badge--primary': record.status === 'complete' }"
                >{{ FIELD_STATUS_LABELS[record.status] ?? record.status }}</span>
              </p>
              <p class="acu-v2-continuation-materials__card-meta">Trường đã ghi: {{ record.fieldNames.join(', ') || '(không có)' }}</p>
              <p v-if="record.missingFields.length" class="acu-v2-continuation-materials__card-meta">Thiếu cột: {{ record.missingFields.join(', ') }}</p>
              <p class="acu-v2-continuation-materials__card-meta">
                Cập nhật gần nhất {{ formatTimestamp(record.updatedAt) }}<template v-if="record.maxRevision > 0"> · số sửa đổi cột cao nhất {{ record.maxRevision }}</template>
              </p>
            </div>
          </div>
        </details>
        <template v-if="materials.snapshot.value?.pendingFixes.length">
          <p class="acu-v2-continuation-materials__meta">Lần ghi cần sửa ({{ materials.snapshot.value.pendingFixes.length }} mục):</p>
          <div class="acu-v2-continuation-materials__cards">
            <div
              v-for="(fix, fixIndex) in materials.snapshot.value.pendingFixes"
              :key="`${fix.module}-${fixIndex}`"
              class="acu-v2-continuation-materials__card acu-v2-continuation-materials__card--failed"
            >
              <p class="acu-v2-continuation-materials__card-head">
                <strong>{{ CONTINUATION_MATERIAL_MODULE_LABELS_ACU[fix.module] ?? fix.module }}</strong>
                <span class="acu-v2-continuation-materials__badge">{{ fix.completion === 'partial' ? 'Chấp nhận một phần' : 'Thất bại' }}</span>
                <span class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--muted">{{ PENDING_FIX_SOURCE_LABELS[fix.source] ?? fix.source }}</span>
              </p>
              <p class="acu-v2-continuation-materials__card-meta">
                Đường dẫn lỗi: {{ fix.violations.map(item => `${item.path} (${item.message})`).join('; ') || fix.lastError || '(chưa ghi nhận)' }}
              </p>
              <p class="acu-v2-continuation-materials__card-meta">
                Bao phủ tầng {{ fix.rangeStartIndex }}–{{ fix.rangeEndIndex }} · đã chấp nhận {{ fix.acceptedKeys.length }} cột · thử {{ fix.attempts }} lần
              </p>
            </div>
          </div>
        </template>
      </details>

      <!-- 伏笔账本 -->
      <details class="acu-v2-continuation-materials__block" open>
        <summary>Sổ phục bút · {{ materials.snapshot.value?.hooks.length ?? 0 }} mục<span v-if="materials.modules.hooks.dirty" class="acu-v2-continuation-materials__badge">Chưa lưu</span></summary>
        <p v-if="!materials.snapshot.value?.hooks.length" class="acu-v2-continuation-materials__empty">Chưa có mục phục bút.</p>
        <div v-else class="acu-v2-continuation-materials__cards">
          <div
            v-for="hook in materials.snapshot.value.hooks"
            :key="hook.id"
            class="acu-v2-continuation-materials__card"
            :class="{ 'acu-v2-continuation-materials__card--retired': hook.retired }"
          >
            <p class="acu-v2-continuation-materials__card-head">
              <strong>{{ hook.id }}</strong>
              <span class="acu-v2-continuation-materials__badge">{{ HOOK_STATUS_LABELS[hook.status] ?? hook.status }}</span>
              <span class="acu-v2-continuation-materials__badge">{{ HOOK_IMPORTANCE_LABELS[hook.importance] ?? hook.importance }}</span>
              <span v-if="hook.retired" class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--muted">Đã nghỉ hưu{{  hook.retiredReason ? `: ${hook.retiredReason}` : '' }}</span>
            </p>
            <p class="acu-v2-continuation-materials__card-body">{{ hook.summary }}</p>
            <p class="acu-v2-continuation-materials__card-meta">Tầng gieo {{ hook.plantedIndex }} · tầng cập nhật gần nhất {{ hook.updatedIndex }}<template v-if="hook.plannedPayoff"> · dự kiến thu hồi: {{ hook.plannedPayoff }}</template></p>
          </div>
        </div>
        <details class="acu-v2-continuation-materials__json">
          <summary>Sửa JSON gốc</summary>
          <AcuTextarea :model-value="materials.modules.hooks.draft" :rows="12" @update:model-value="value => materials.updateDraft('hooks', value)" />
          <p v-if="materials.modules.hooks.error" class="acu-v2-continuation-materials__error">{{ materials.modules.hooks.error }}</p>
          <div class="acu-v2-continuation-materials__actions">
            <AcuButton :disabled="!materials.modules.hooks.dirty" @click="materials.discard('hooks')">Bỏ thay đổi</AcuButton>
            <AcuButton variant="primary" :loading="materials.modules.hooks.saving" :disabled="!materials.modules.hooks.dirty" @click="materials.save('hooks')">Lưu sổ phục bút</AcuButton>
          </div>
        </details>
      </details>

      <!-- 认知与信息差 -->
      <details class="acu-v2-continuation-materials__block" open>
        <summary>Nhận thức và chênh lệch thông tin · {{ materials.snapshot.value?.infoGap.length ?? 0 }} mục<span v-if="materials.modules.infoGap.dirty" class="acu-v2-continuation-materials__badge">Chưa lưu</span></summary>
        <p v-if="!materials.snapshot.value?.infoGap.length" class="acu-v2-continuation-materials__empty">Chưa có mục chênh lệch thông tin.</p>
        <div v-else class="acu-v2-continuation-materials__cards">
          <div
            v-for="gap in materials.snapshot.value.infoGap"
            :key="gap.id"
            class="acu-v2-continuation-materials__card"
            :class="{ 'acu-v2-continuation-materials__card--retired': gap.retired }"
          >
            <p class="acu-v2-continuation-materials__card-head">
              <strong>{{ gap.id }}</strong>
              <span>{{ gap.topic }}</span>
              <span class="acu-v2-continuation-materials__badge">{{ REVEAL_STATUS_LABELS[gap.revealStatus] ?? gap.revealStatus }}</span>
              <span v-if="gap.revealIndex !== null" class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--muted">Tầng tiết lộ {{ gap.revealIndex }}</span>
              <span v-if="gap.retired" class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--muted">Đã nghỉ hưu{{  gap.retiredReason ? `: ${gap.retiredReason}` : '' }}</span>
            </p>
            <p class="acu-v2-continuation-materials__card-body">Sự thật khách quan: {{ gap.objectiveFact }}</p>
            <p class="acu-v2-continuation-materials__card-meta">Độc giả đã biết: {{ gap.readerKnown || '(chưa ghi nhận)' }}</p>
            <p v-for="knowledge in gap.characterKnowledge" :key="knowledge.name" class="acu-v2-continuation-materials__card-meta">
              {{ knowledge.name }} biết: {{ knowledge.knows }}
            </p>
          </div>
        </div>
        <details class="acu-v2-continuation-materials__json">
          <summary>Sửa JSON gốc</summary>
          <AcuTextarea :model-value="materials.modules.infoGap.draft" :rows="12" @update:model-value="value => materials.updateDraft('infoGap', value)" />
          <p v-if="materials.modules.infoGap.error" class="acu-v2-continuation-materials__error">{{ materials.modules.infoGap.error }}</p>
          <div class="acu-v2-continuation-materials__actions">
            <AcuButton :disabled="!materials.modules.infoGap.dirty" @click="materials.discard('infoGap')">Bỏ thay đổi</AcuButton>
            <AcuButton variant="primary" :loading="materials.modules.infoGap.saving" :disabled="!materials.modules.infoGap.dirty" @click="materials.save('infoGap')">Lưu chênh lệch thông tin</AcuButton>
          </div>
        </details>
      </details>

      <!-- 长期约束 -->
      <details class="acu-v2-continuation-materials__block" open>
        <summary>Ràng buộc dài hạn · {{ materials.snapshot.value?.constraints.length ?? 0 }} mục<span v-if="materials.modules.constraints.dirty" class="acu-v2-continuation-materials__badge">Chưa lưu</span></summary>
        <p v-if="!materials.snapshot.value?.constraints.length" class="acu-v2-continuation-materials__empty">Chưa có ràng buộc dài hạn.</p>
        <div v-else class="acu-v2-continuation-materials__cards">
          <div v-for="constraint in materials.snapshot.value.constraints" :key="constraint.id" class="acu-v2-continuation-materials__card">
            <p class="acu-v2-continuation-materials__card-head"><strong>{{ constraint.id }}</strong></p>
            <p class="acu-v2-continuation-materials__card-body">{{ constraint.text }}</p>
            <p class="acu-v2-continuation-materials__card-meta">Tầng đăng ký {{ constraint.createdIndex }}<template v-if="constraint.reason"> · lý do: {{ constraint.reason }}</template></p>
          </div>
        </div>
        <details class="acu-v2-continuation-materials__json">
          <summary>Sửa JSON gốc</summary>
          <AcuTextarea :model-value="materials.modules.constraints.draft" :rows="10" @update:model-value="value => materials.updateDraft('constraints', value)" />
          <p v-if="materials.modules.constraints.error" class="acu-v2-continuation-materials__error">{{ materials.modules.constraints.error }}</p>
          <div class="acu-v2-continuation-materials__actions">
            <AcuButton :disabled="!materials.modules.constraints.dirty" @click="materials.discard('constraints')">Bỏ thay đổi</AcuButton>
            <AcuButton variant="primary" :loading="materials.modules.constraints.saving" :disabled="!materials.modules.constraints.dirty" @click="materials.save('constraints')">Lưu ràng buộc dài hạn</AcuButton>
          </div>
        </details>
      </details>

      <!-- 故事年代学账本 -->
      <details class="acu-v2-continuation-materials__block" open>
        <summary>Sổ niên đại học truyện · {{ materials.snapshot.value?.chronology.length ?? 0 }} mục<span v-if="materials.modules.chronology.dirty" class="acu-v2-continuation-materials__badge">Chưa lưu</span></summary>
        <p v-if="!materials.snapshot.value?.chronology.length" class="acu-v2-continuation-materials__empty">Chưa có bản ghi thời gian truyện đã kết toán. Sự thật về thời gian do agent bảo trì kết toán đăng ký dựa trên nội dung thực; các trường thời gian trong dàn ý chỉ là kế hoạch.</p>
        <div v-else class="acu-v2-continuation-materials__cards">
          <div
            v-for="entry in materials.snapshot.value.chronology"
            :key="entry.id"
            class="acu-v2-continuation-materials__card"
            :class="{ 'acu-v2-continuation-materials__card--retired': entry.retired }"
          >
            <p class="acu-v2-continuation-materials__card-head">
              <strong>{{ entry.id }}</strong>
              <span>{{ entry.anchor }}</span>
              <span class="acu-v2-continuation-materials__badge">{{ CHRONOLOGY_PRECISION_LABELS[entry.precision] ?? entry.precision }}</span>
              <span v-if="entry.retired" class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--muted">Đã vô hiệu{{  entry.retiredReason ? `: ${entry.retiredReason}` : '' }}</span>
            </p>
            <p class="acu-v2-continuation-materials__card-body">Tổng thời gian trôi qua: {{ entry.elapsed }}</p>
            <p class="acu-v2-continuation-materials__card-body">Chuyển đổi thời gian: {{ entry.transition }}</p>
            <p class="acu-v2-continuation-materials__card-meta">Tầng chứng cứ {{ entry.evidenceIndexes.join(', ') }} · tầng kết toán {{ entry.updatedIndex }}</p>
          </div>
        </div>
        <details class="acu-v2-continuation-materials__json">
          <summary>Sửa JSON gốc</summary>
          <AcuTextarea :model-value="materials.modules.chronology.draft" :rows="10" @update:model-value="value => materials.updateDraft('chronology', value)" />
          <p v-if="materials.modules.chronology.error" class="acu-v2-continuation-materials__error">{{ materials.modules.chronology.error }}</p>
          <div class="acu-v2-continuation-materials__actions">
            <AcuButton :disabled="!materials.modules.chronology.dirty" @click="materials.discard('chronology')">Bỏ thay đổi</AcuButton>
            <AcuButton variant="primary" :loading="materials.modules.chronology.saving" :disabled="!materials.modules.chronology.dirty" @click="materials.save('chronology')">Lưu sổ niên đại học</AcuButton>
          </div>
        </details>
      </details>
    </template>

    <!-- 百科资料库：web-researcher 从互联网查到的原作/公开设定，按实体分条 -->
    <template v-else-if="activeTab === 'webRefs'">
      <p class="acu-v2-continuation-materials__meta">
        Kho tư liệu bách khoa do Agent phụ web-researcher ghi sau khi tra từ Moegirl, Wikipedia, Baidu Baike hoặc trang web, chia mục theo thực thể (nhân vật, pháp thuật, vật phẩm, sự kiện…).
        Mỗi mục chỉ có «tên + giới thiệu một câu», chi tiết theo định dạng tự do. Ngữ cảnh Agent chỉ chèn dòng xem trước, chi tiết do chúng đọc kỹ theo ID.
        Nó ghi lại thiết lập gốc/công khai, không phải sự thật đã xảy ra trong truyện này; khi mâu thuẫn với Sổ thế giới hoặc nội dung chính thì lấy cái sau làm chuẩn.
      </p>
      <p v-if="materials.snapshot.value" class="acu-v2-continuation-materials__meta">
        Mục {{ materials.snapshot.value.webRefs.length }} (đang hoạt động {{ materials.snapshot.value.webRefs.filter(entry => !entry.retired).length }}) · số sửa đổi  {{ materials.snapshot.value.revisions.webRefs }}
      </p>
      <p v-if="materials.loadError.value" class="acu-v2-continuation-materials__error">{{ materials.loadError.value }}</p>
      <p v-if="!materials.snapshot.value?.webRefs.length" class="acu-v2-continuation-materials__empty">
        Chưa có tư liệu bách khoa. Sau khi tích «Bật tra cứu bách khoa mở đầu» trong cài đặt viết tiếp, tác vụ mới sẽ tự tra cứu trước lần lên kế hoạch đầu tiên; Agent chính sau đó cũng có thể giao web-researcher theo nhu cầu.
      </p>
      <div v-else class="acu-v2-continuation-materials__cards">
        <details
          v-for="ref in materials.snapshot.value.webRefs"
          :key="ref.id"
          class="acu-v2-continuation-materials__card"
          :class="{ 'acu-v2-continuation-materials__card--retired': ref.retired }"
        >
          <summary class="acu-v2-continuation-materials__card-head">
            <strong>{{ ref.id }}</strong>
            <span>{{ ref.title }}</span>
            <span class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--primary">{{ WEB_REF_SOURCE_LABELS[ref.source] ?? ref.source }}</span>
            <span v-for="tag in ref.tags" :key="tag" class="acu-v2-continuation-materials__badge">{{ tag }}</span>
            <span v-if="ref.sourceStatus !== 'ok'" class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--muted">{{ WEB_REF_STATUS_LABELS[ref.sourceStatus] ?? ref.sourceStatus }}</span>
            <span v-if="ref.retired" class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--muted">Đã nghỉ hưu{{  ref.retiredReason ? `: ${ref.retiredReason}` : '' }}</span>
          </summary>
          <p class="acu-v2-continuation-materials__card-body">{{ ref.brief }}</p>
          <p v-if="ref.summary" class="acu-v2-continuation-materials__card-body">{{ ref.summary }}</p>
          <p class="acu-v2-continuation-materials__card-meta">
            <a :href="ref.url" target="_blank" rel="noopener noreferrer">{{ ref.url }}</a>
            <template v-if="ref.query"> · từ khóa tra cứu: {{ ref.query }}</template>
            <template v-if="ref.fetchedAt"> · thu thập lúc  {{ new Date(ref.fetchedAt).toLocaleString() }}</template>
          </p>
        </details>
      </div>
      <details class="acu-v2-continuation-materials__json">
        <summary>Sửa JSON gốc</summary>
        <p class="acu-v2-continuation-materials__card-meta">Mỗi mục cần tối thiểu id, title (tên), url, brief (giới thiệu một câu); summary là chi tiết định dạng tự do, tags tùy chọn. Nguyên văn trang web không được lưu. Mục thêm thủ công có thể ghi source là web.</p>
        <AcuTextarea :model-value="materials.modules.webRefs.draft" :rows="14" @update:model-value="value => materials.updateDraft('webRefs', value)" />
        <p v-if="materials.modules.webRefs.error" class="acu-v2-continuation-materials__error">{{ materials.modules.webRefs.error }}</p>
        <div class="acu-v2-continuation-materials__actions">
          <AcuButton :disabled="!materials.modules.webRefs.dirty" @click="materials.discard('webRefs')">Bỏ thay đổi</AcuButton>
          <AcuButton variant="primary" :loading="materials.modules.webRefs.saving" :disabled="!materials.modules.webRefs.dirty" @click="materials.save('webRefs')">Lưu kho tư liệu bách khoa</AcuButton>
        </div>
      </details>
    </template>

    <!-- 用户要求：Agent 会话里用户累计提出的任务要求 -->
    <template v-else-if="activeTab === 'userRequirements'">
      <p class="acu-v2-continuation-materials__meta">
        Yêu cầu người dùng được duy trì thủ công trong kho tài liệu. Khi tạo tác vụ, yêu cầu ban đầu được ghi thành mục đầu tiên; mỗi thẻ là một yêu cầu, khi lưu tự chuyển thành mảng chuỗi.
      </p>
      <p v-if="materials.snapshot.value" class="acu-v2-continuation-materials__meta">
        Mục {{ materials.snapshot.value.userRequirements.length }} · số sửa đổi  {{ materials.snapshot.value.revisions.userRequirements }}
      </p>
      <p v-if="materials.loadError.value" class="acu-v2-continuation-materials__error">{{ materials.loadError.value }}</p>
      <p v-if="materials.snapshot.value && !materials.snapshot.value.userRequirements.length" class="acu-v2-continuation-materials__empty">
        Chưa có mục yêu cầu người dùng. Có thể bấm thêm thẻ để thêm thủ công.
      </p>
      <UserRequirementsEditor
        editor-id="continuation"
        :items="requirementItems"
        :dirty="materials.modules.userRequirements.dirty"
        :error="materials.modules.userRequirements.error"
        :saving="materials.modules.userRequirements.saving"
        :disabled="!materials.snapshot.value || busy"
        @update:items="updateRequirementItems"
        @discard="materials.discard('userRequirements')"
        @save="materials.save('userRequirements')"
      />
    </template>

    <!-- 故事总纲：结构化展示 + JSON 编辑 -->
    <template v-else-if="activeTab === 'storyArc'">
      <p class="acu-v2-continuation-materials__meta">
        Tổng cương truyện do Agent phụ arc-architect duy trì: một mục hướng đi toàn truyện + vài bậc theo tập. Cũng có thể sửa thủ công tại đây, khi lưu qua cùng bước kiểm tra cấu trúc và tăng số sửa đổi.
      </p>
      <p v-if="materials.snapshot.value" class="acu-v2-continuation-materials__meta">
        Tổng cương {{ materials.snapshot.value.storyArc.length }} mục · số sửa đổi  {{ materials.snapshot.value.revisions.storyArc }}
      </p>
      <p v-if="materials.loadError.value" class="acu-v2-continuation-materials__error">{{ materials.loadError.value }}</p>
      <p v-if="!materials.snapshot.value?.storyArc.length" class="acu-v2-continuation-materials__empty">
        Chưa có tổng cương truyện. Sau khi bắt đầu lên kế hoạch, Agent chính sẽ giao arc-architect lập tổng cương trước.
      </p>
      <div v-else class="acu-v2-continuation-materials__cards">
        <div
          v-for="arc in materials.snapshot.value.storyArc"
          :key="arc.id"
          class="acu-v2-continuation-materials__card"
          :class="{ 'acu-v2-continuation-materials__card--retired': arc.retired }"
        >
          <p class="acu-v2-continuation-materials__card-head">
            <strong>{{ arc.id }}</strong>
            <span class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--primary">{{ arc.scope === 'story' ? 'Hướng đi toàn truyện' : 'Bậc theo tập' }}</span>
            <span class="acu-v2-continuation-materials__badge">{{ ARC_STATUS_LABELS[arc.status] ?? arc.status }}</span>
            <span>{{ arc.title }}</span>
            <span v-if="arc.retired" class="acu-v2-continuation-materials__badge acu-v2-continuation-materials__badge--muted">Đã nghỉ hưu{{  arc.retiredReason ? `: ${arc.retiredReason}` : '' }}</span>
          </p>
          <p class="acu-v2-continuation-materials__card-body">Hướng đi: {{ arc.direction }}</p>
          <p v-if="arc.escalation" class="acu-v2-continuation-materials__card-body">Mức xung đột: {{ arc.escalation }}</p>
          <p v-if="arc.withheld" class="acu-v2-continuation-materials__card-meta">Không được lật bài ngửa: {{ arc.withheld }}</p>
          <p class="acu-v2-continuation-materials__card-meta">
            Giai đoạn đã đảm nhận: {{ arc.stageNumbers.length ? arc.stageNumbers.join(', ') : '(chưa đảm nhận)' }}
          </p>
        </div>
      </div>
      <details class="acu-v2-continuation-materials__json">
        <summary>Sửa JSON gốc</summary>
        <AcuTextarea :model-value="materials.modules.storyArc.draft" :rows="14" @update:model-value="value => materials.updateDraft('storyArc', value)" />
        <p v-if="materials.modules.storyArc.error" class="acu-v2-continuation-materials__error">{{ materials.modules.storyArc.error }}</p>
        <div class="acu-v2-continuation-materials__actions">
          <AcuButton :disabled="!materials.modules.storyArc.dirty" @click="materials.discard('storyArc')">Bỏ thay đổi</AcuButton>
          <AcuButton variant="primary" :loading="materials.modules.storyArc.saving" :disabled="!materials.modules.storyArc.dirty" @click="materials.save('storyArc')">Lưu tổng cương truyện</AcuButton>
        </div>
      </details>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AcuButton from './_lib/AcuButton.vue';
import AcuTextarea from './_lib/AcuTextarea.vue';
import UserRequirementsEditor from './UserRequirementsEditor.vue';
import { useContinuationMaterials, CONTINUATION_MATERIAL_MODULE_LABELS_ACU } from '../composables/useContinuationMaterials';

import type { ContinuationStage_ACU, ContinuationTask_ACU, StageOutline_ACU, StageRevision_ACU } from '../../service/continuation/model'; // arch-ok: 仅类型导入，用于 props 标注，编译后无运行时依赖
import type { AgentWritableModule_ACU } from '../../service/continuation/agent/agent-model'; // arch-ok: 仅类型导入，用于 emits 与分栏记录标注，编译后无运行时依赖


const props = defineProps<{
  task: ContinuationTask_ACU | null;
  activeStage: ContinuationStage_ACU | null;
  activeRevision: StageRevision_ACU | null;
  busy: boolean;
}>();

const emit = defineEmits<{
  (event: 'save-outline', outline: StageOutline_ACU): void;
  (event: 'clear'): void;
  (event: 'repair', modules: AgentWritableModule_ACU[]): void;
}>();

const TABS = [
  { id: 'outline', label: 'Dàn ý giai đoạn' },
  { id: 'modules', label: 'Tài liệu cục bộ' },
  { id: 'storyArc', label: 'Tổng cương truyện' },
  { id: 'webRefs', label: 'Tư liệu bách khoa' },
  { id: 'userRequirements', label: 'Yêu cầu người dùng' },
] as const;

type TabId = typeof TABS[number]['id'];

const HOOK_STATUS_LABELS: Record<string, string> = {
  planted: 'Đã gieo', reinforced: 'Đã củng cố', misled: 'Đã đánh lạc hướng', partially_paid: 'Thu hồi một phần', paid: 'Đã thu hồi', abandoned: 'Đã bỏ',
};
const HOOK_IMPORTANCE_LABELS: Record<string, string> = { high: 'Độ quan trọng: cao', mid: 'Độ quan trọng: vừa', low: 'Độ quan trọng: thấp' };
const REVEAL_STATUS_LABELS: Record<string, string> = { unrevealed: 'Chưa tiết lộ', partial: 'Tiết lộ một phần', revealed: 'Đã tiết lộ' };
const CHRONOLOGY_PRECISION_LABELS: Record<string, string> = { exact: 'Chính xác', approximate: 'Xấp xỉ', unknown: 'Không rõ' };
const ARC_STATUS_LABELS: Record<string, string> = { planned: 'Đã lên kế hoạch', active: 'Đang chạy', done: 'Đã xong' };
const WEB_REF_SOURCE_LABELS: Record<string, string> = { moegirl: 'Moegirl', wikipedia_zh: 'Wikipedia tiếng Trung', wikipedia_en: 'Wikipedia tiếng Anh', baidu: 'Baidu Baike', web: 'Trang web' };
const WEB_REF_STATUS_LABELS: Record<string, string> = { ok: 'Bình thường', unavailable: 'Nguồn không khả dụng', blocked: 'Bị chặn' };
const TEMPO_LABELS: Record<string, string> = { buildup: 'Kiểu dẫn dắt', mixed: 'Kiểu lên xuống', surge: 'Kiểu áp lực cao', aftermath: 'Kiểu dư chấn' };
const ROLE_LABELS: Record<string, string> = { setup: 'Thiết lập', development: 'Phát triển', escalation: 'Leo thang', turn: 'Chuyển biến', payoff: 'Thực hiện', aftermath: 'Dư chấn' };
const PACING_LABELS: Record<string, string> = { setup: 'Dẫn dắt', pressure: 'Gây áp lực', turn: 'Chuyển biến', cooldown: 'Hạ nhiệt' };
const FUNCTION_LABELS: Record<string, string> = { daily_bond: 'Thường nhật quan hệ', daily_world: 'Thường nhật thế giới', recovery: 'Hồi phục', preparation: 'Chuẩn bị', training: 'Huấn luyện', economy: 'Kinh doanh', side_thread: 'Tuyến phụ', conflict: 'Xung đột', reveal: 'Tiết lộ', payoff: 'Thực hiện', transition: 'Chuyển tiếp' };
const MAINLINE_LABELS: Record<string, string> = { hold: 'Dừng', micro: 'Tăng nhẹ', step: 'Tiến lên', milestone: 'Cột mốc' };
const TIME_LABELS: Record<string, string> = { continuous: 'Liên tục', same_day: 'Cùng ngày, lát sau', overnight: 'Qua đêm', days: 'Vài ngày', weeks: 'Vài tuần', months: 'Vài tháng', years: 'Vài năm' };
const INFERRED_FIELD_LABELS: Record<string, string> = { function: 'Chức năng', mainlineDelta: 'Tuyến chính', timeAdvance: 'Thời gian' };

const activeTab = ref<TabId>('outline');
const materials = useContinuationMaterials();

const requirementItems = computed<string[]>(() => {
  try {
    const parsed: unknown = JSON.parse(materials.modules.userRequirements.draft);
    return Array.isArray(parsed) && parsed.every(item => typeof item === 'string') ? parsed : [];
  } catch {
    return [];
  }
});

function updateRequirementItems(items: string[]): void {
  materials.updateDraft('userRequirements', JSON.stringify(items, null, 2));
  materials.modules.userRequirements.error = '';
}

const MATERIAL_STATUS_LABELS_ACU: Record<string, string> = {
  hooks: 'Sổ phục bút', infoGap: 'Nhận thức và chênh lệch thông tin', constraints: 'Ràng buộc dài hạn', storyArc: 'Tổng cương truyện',
  chronology: 'Sổ niên đại học truyện', webRefs: 'Kho tư liệu bách khoa', userRequirements: 'Yêu cầu người dùng',
};

/** 分栏记录状态：complete 完整、partial 未写齐（只在分栏视图）、legacy_unknown 旧整条快照条目。 */
const FIELD_STATUS_LABELS: Record<string, string> = {
  complete: 'Đầy đủ',
  partial: 'Một phần (chưa nâng cấp)',
  legacy_unknown: 'Mục snapshot cũ',
};
const COMPLETION_STATE_LABELS: Record<string, string> = {
  complete: 'Đã xong',
  partial: 'Xong một phần',
  failed: 'Thất bại',
  legacy_unknown: 'Không rõ (khung cũ)',
};
const PENDING_FIX_SOURCE_LABELS: Record<string, string> = {
  truncated: 'Đầu ra bị cắt',
  contract_rejected: 'Hợp đồng bị từ chối',
  protocol_failed: 'Giao thức thất bại',
  invoke_failed: 'Gọi thất bại',
  transaction_rejected: 'Giao dịch bị từ chối',
};

/** 逐栏记录按模块分组：只取栏目名与修订身份，不取字段值。 */
const fieldRecordGroups = computed(() => {
  const records = materials.fieldSnapshot.value.records;
  const completion = materials.snapshot.value?.materialCompletion.modules ?? {};
  return (Object.keys(CONTINUATION_MATERIAL_MODULE_LABELS_ACU) as AgentWritableModule_ACU[])
    .map(module => {
      const bucket = records[module];
      const entries = bucket ? Object.values(bucket) : [];
      if (!entries.length) return null;
      const moduleState = completion[module];
      return {
        module,
        label: CONTINUATION_MATERIAL_MODULE_LABELS_ACU[module],
        completionLabel: moduleState ? (COMPLETION_STATE_LABELS[moduleState] ?? moduleState) : '',
        records: entries
          .map(record => ({
            id: record.id,
            status: record.status,
            fieldNames: Object.keys(record.fields),
            missingFields: record.missingFields,
            maxRevision: Object.values(record.fields).reduce((max, field) => Math.max(max, field.revision), 0),
            updatedAt: record.updatedAt,
          }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);
});
const fieldRecordTotal = computed(() => fieldRecordGroups.value.reduce((total, group) => total + group.records.length, 0));

function formatTimestamp(value: number): string {
  return value > 0 ? new Date(value).toLocaleString() : '(chưa ghi nhận)';
}



const outlineDraft = ref('');
const outlineError = ref('');
const outlineDirty = ref(false);
const clearPending = ref(false);
const expandedHistoryStageIds = ref(new Set<string>());
const activeVolume = computed(() => materials.snapshot.value?.storyArc.find(entry => entry.scope === 'volume' && !entry.retired && entry.status === 'active') ?? null);
const historyStages = computed(() => (props.task?.stages ?? []).filter(stage => stage.stageId !== props.activeStage?.stageId));

function onHistoryStageToggle(stageId: string, event: Event): void {
  const open = event.target instanceof HTMLDetailsElement ? event.target.open : false;
  const next = new Set(expandedHistoryStageIds.value);
  if (open) next.add(stageId);
  else next.delete(stageId);
  expandedHistoryStageIds.value = next;
}

function displayRevision(stage: ContinuationStage_ACU): StageRevision_ACU | null {
  return stage.revisions.find(revision => revision.revision === stage.activeRevision)
    ?? stage.revisions.reduce<StageRevision_ACU | null>((latest, revision) => !latest || revision.revision > latest.revision ? revision : latest, null);
}

function olderRevisions(stage: ContinuationStage_ACU): StageRevision_ACU[] {
  const displayed = displayRevision(stage);
  return stage.revisions.filter(revision => revision.revision !== displayed?.revision).sort((left, right) => right.revision - left.revision);
}

function remainingTurns(stage: ContinuationStage_ACU, revision: StageRevision_ACU): number {
  return Math.max(0, revision.outline.totalTurns - stage.completedTurns);
}

function stageTotalTurns(stage: ContinuationStage_ACU): number {
  return stage.revisions.find(item => item.revision === stage.activeRevision)?.outline.totalTurns ?? 0;
}

/** 某个节点内第 turnIndex 轮在整个阶段里的全局轮号（从 1 起），用于已完成轮次的置灰标记。 */
function turnPosition(revision: StageRevision_ACU, nodeId: string, turnIndex: number): number {
  let position = 0;
  for (const node of revision.outline.nodes) {
    if (node.id === nodeId) return position + turnIndex + 1;
    position += node.turns.length;
  }
  return position + turnIndex + 1;
}

function turnState(revision: StageRevision_ACU, nodeIndex: number, turnIndex: number): 'done' | 'current' | 'planned' {
  const stage = props.activeStage;
  if (!stage || revision.revision !== props.activeRevision?.revision) return 'planned';
  const node = revision.outline.nodes[nodeIndex];
  if (!node) return 'planned';
  if (turnPosition(revision, node.id, turnIndex) <= stage.completedTurns) return 'done';
  if (nodeIndex === stage.activeNodeIndex && turnIndex === stage.activeTurnIndex) return 'current';
  return 'planned';
}

function syncOutlineDraft(): void {
  outlineDraft.value = props.activeRevision ? JSON.stringify(props.activeRevision.outline, null, 2) : '';
  outlineError.value = '';
  outlineDirty.value = false;
}

function onOutlineInput(value: string): void {
  outlineDraft.value = value;
  outlineDirty.value = true;
}

function saveOutline(): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outlineDraft.value);
  } catch (error) {
    outlineError.value = error instanceof Error ? `Không thể phân tích JSON dàn ý: ${error.message}` : 'Không thể phân tích JSON dàn ý';
    return;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    outlineError.value = 'Dàn ý phải là một đối tượng JSON';
    return;
  }
  outlineError.value = '';
  emit('save-outline', parsed as StageOutline_ACU);
}

/**
 * 重读资料快照与大纲草稿。
 * @param options.preserveDirty Agent 运行中的自动刷新传 true：只刷新未编辑的模块，用户手里的草稿保留。
 */
function reload(options: { preserveDirty?: boolean } = {}): void {
  materials.reload(options);
  if (!options.preserveDirty || !outlineDirty.value) syncOutlineDraft();
}

function requestClear(): void {
  clearPending.value = true;
}

function confirmClear(): void {
  clearPending.value = false;
  emit('clear');
}

onMounted(() => reload());

/** 权威大纲变更（Agent 改写、保存成功）后重置草稿；用户正在编辑时不覆盖他的输入。 */
watch(() => `${props.activeStage?.stageId ?? ''}:${props.activeRevision?.revision ?? ''}`, () => {
  if (!outlineDirty.value) syncOutlineDraft();
}, { immediate: true });

defineExpose({ reload });
</script>

<style scoped>
.acu-v2-continuation-materials { display: grid; gap: 12px; }
.acu-v2-continuation-materials__tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.acu-v2-continuation-materials__tab { padding: 5px 12px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 22%, transparent); border-radius: 999px; background: transparent; color: var(--acu-text-2); cursor: pointer; font: inherit; font-size: var(--acu-font-size-body, 12px); }
.acu-v2-continuation-materials__tab--active { border-color: color-mix(in srgb, var(--acu-primary, #5b8def) 55%, transparent); background: color-mix(in srgb, var(--acu-primary, #5b8def) 14%, transparent); color: var(--acu-text-1); }
.acu-v2-continuation-materials__tab-actions { display: flex; gap: 6px; margin-left: auto; }
.acu-v2-continuation-materials__confirm { margin: 0; padding: 10px; border: 1px solid color-mix(in srgb, var(--acu-danger, #d65b5b) 40%, transparent); border-radius: 6px; background: color-mix(in srgb, var(--acu-danger, #d65b5b) 7%, transparent); color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-continuation-materials__confirm-actions { display: inline-flex; gap: 6px; margin-left: 8px; vertical-align: middle; }
.acu-v2-continuation-materials__outline { display: grid; gap: 8px; }
.acu-v2-continuation-materials__empty { margin: 0; color: var(--acu-text-3); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-continuation-materials__meta { margin: 0; color: var(--acu-text-3); font-size: var(--acu-font-size-body, 12px); white-space: pre-wrap; }
.acu-v2-continuation-materials__error { margin: 0; color: var(--acu-danger, #d65b5b); white-space: pre-wrap; font-size: var(--acu-font-size-body, 12px); }
.acu-v2-continuation-materials__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
.acu-v2-continuation-materials__block { padding: 10px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 20%, transparent); border-radius: 6px; display: grid; gap: 8px; }
.acu-v2-continuation-materials__block > summary { cursor: pointer; color: var(--acu-text-1); }
.acu-v2-continuation-materials__block--current { border-color: color-mix(in srgb, var(--acu-primary, #5b8def) 45%, transparent); }
.acu-v2-continuation-materials__list { display: flex; flex-direction: column; gap: 6px; padding-left: 22px; color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-continuation-materials__outline-summary, .acu-v2-continuation-materials__outline-node { padding: 10px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 16%, transparent); border-radius: 6px; display: grid; gap: 5px; }
.acu-v2-continuation-materials__outline-heading { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--acu-text-1); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-continuation-materials__outline-nodes { display: grid; gap: 8px; }
.acu-v2-continuation-materials__turns { display: grid; gap: 5px; margin: 0; padding-left: 22px; color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-continuation-materials__turns > li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.acu-v2-continuation-materials__turn--done { color: var(--acu-text-3); }
.acu-v2-continuation-materials__turn--current { padding: 5px 7px; margin-left: -7px; border-radius: 4px; background: color-mix(in srgb, var(--acu-primary, #5b8def) 14%, transparent); color: var(--acu-text-1); }
.acu-v2-continuation-materials__turn--planned { color: var(--acu-text-2); }
.acu-v2-continuation-materials__cards { display: grid; gap: 8px; }
.acu-v2-continuation-materials__card { padding: 8px 10px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 16%, transparent); border-radius: 6px; display: grid; gap: 4px; }
.acu-v2-continuation-materials__card--failed { border-left: 3px solid color-mix(in srgb, var(--acu-danger, #d65b5b) 75%, transparent); }
.acu-v2-continuation-materials__card--retired { opacity: 0.55; }
.acu-v2-continuation-materials__card > summary.acu-v2-continuation-materials__card-head { cursor: pointer; list-style: none; }
.acu-v2-continuation-materials__card-meta a { color: inherit; word-break: break-all; }
.acu-v2-continuation-materials__card-head { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: var(--acu-text-1); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-continuation-materials__card-body { margin: 0; color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); white-space: pre-wrap; }
.acu-v2-continuation-materials__card-meta { margin: 0; color: var(--acu-text-3); font-size: var(--acu-font-size-body, 12px); white-space: pre-wrap; }
.acu-v2-continuation-materials__badge { padding: 1px 8px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--acu-text-3) 30%, transparent); color: var(--acu-text-2); font-size: 11px; }
.acu-v2-continuation-materials__badge--primary { border-color: color-mix(in srgb, var(--acu-primary, #5b8def) 55%, transparent); color: var(--acu-text-1); background: color-mix(in srgb, var(--acu-primary, #5b8def) 12%, transparent); }
.acu-v2-continuation-materials__badge--muted { opacity: 0.8; }
.acu-v2-continuation-materials__json { display: grid; gap: 8px; }
.acu-v2-continuation-materials__json > summary { cursor: pointer; color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); }
.acu-v2-continuation-materials__history { display: grid; gap: 8px; }
.acu-v2-continuation-materials__history-revision { padding: 8px; border-left: 2px solid color-mix(in srgb, var(--acu-text-3) 28%, transparent); }

/* 手机窄屏：刷新/清空按钮换到独立一行靠右，避免和页签挤成两行半。 */
@media (max-width: 640px) {
  .acu-v2-continuation-materials__tab-actions { margin-left: 0; width: 100%; justify-content: flex-end; }
  .acu-v2-continuation-materials__confirm-actions { display: flex; margin: 8px 0 0; }
}
</style>
