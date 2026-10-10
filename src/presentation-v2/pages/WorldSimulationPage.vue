<template>
  <section class="acu-v2-world-simulation-page">
    <AcuPanel title="Phiên Agent" description="Dùng như trò chuyện với coding agent: nhập bất cứ lúc nào, ngắt bất cứ lúc nào. Agent chính giao Agent phụ thu thập chứng cứ và viết lại khi cần; sổ cái cuối cùng sau khi được duyệt sẽ được ghi nghiêm ngặt vào tầng assistant đã đóng băng lúc tác vụ bắt đầu; sau khi nội dung tạo xong cũng sẽ tự động mô phỏng một lần.">
      <p v-if="runtime.error.value" class="acu-v2-world-simulation-page__error">
        {{ runtime.error.value }}
        <AcuButton size="sm" @click="refreshAll">Đọc lại</AcuButton>
      </p>
      <p v-else-if="!runtime.ready.value" class="acu-v2-world-simulation-page__meta">Đang đọc và xác minh snapshot Mô phỏng thế giới…</p>
      <WorldSimulationChat
        v-else
        :task="runtime.task.value"
        :last-error="runtime.envelope.value?.lastError ?? null"
        :entries="runtime.entries.value"
        :running="runtime.running.value"
        :draft="messageDraft"
        :sending="messageSending"
        :status-text="runtime.statusText.value"
        :stage-text="runtime.stageText.value"
        :revision-text="runtime.revisionText.value"
        :anchor-text="runtime.anchorText.value"
        @send="sendMessage"
        @update:draft="messageDraft = $event"
        @stop="runtime.stop"
      />
    </AcuPanel>

    <!-- 会话独占整宽，资料与设置并列在其下：会话是主操作面，资料与设置是查阅面。 -->
    <AcuPanelGrid class="acu-v2-world-simulation-page__layout">
      <AcuPanel title="Tài liệu hiện có" description="Yêu cầu người dùng, tổng quan sổ cái, kỷ yếu hậu trường, danh sách bỏ lỡ, tin đồn, quỹ đạo ứng viên, tín hiệu ngoài cảnh và chẩn đoán đọc của nhánh hiện tại; yêu cầu người dùng có thể sửa thủ công trong khu tài liệu, sổ cái chỉ do Agent ghi sau khi được duyệt. Xóa sạch một chạm chỉ bỏ tác vụ, bản ghi phiên và snapshot tài liệu theo tầng, không động tới nội dung.">
        <WorldSimulationMaterialsPanel
          v-if="runtime.ready.value && runtime.snapshot.value"
          :save-requirements="runtime.saveUserRequirements"
          :conversation="runtime.snapshot.value.conversation"
          :materials="runtime.snapshot.value.materials"
          :field-snapshot="runtime.snapshot.value.fieldSnapshot"
          :user-requirements="runtime.snapshot.value.userRequirements"
          :session="runtime.entries.value"
          :ledger="'publishedLedger' in runtime.snapshot.value ? runtime.snapshot.value.publishedLedger ?? null : runtime.snapshot.value.envelope?.ledger ?? null"
          :anchor="runtime.anchor.value"
          :projection-preview="runtime.snapshot.value.projectionPreview"
          :busy="runtime.busy.value"
          :timeline="runtime.envelope.value?.timeline ?? []"
          @refresh="refreshAll"
          @clear="clearData"
        />
        <p v-else class="acu-v2-world-simulation-page__meta">Hiện không có tài liệu Mô phỏng thế giới để hiển thị.</p>
      </AcuPanel>

      <AcuPanel v-if="settingsDraft" title="Cài đặt mô phỏng" description="Tự động lưu sau khi sửa; có thể sửa cả khi tác vụ đang chạy, thay đổi sẽ được ghi xuống sau khi lượt này kết thúc và có hiệu lực từ lượt sau. Mục thường dùng hiển thị sẵn, các tham số còn lại được gập theo chủ đề.">
        <div class="acu-v2-world-simulation-page__settings-grid">
          <AcuFormRow label="Dùng gọi công cụ" hint="Khi bật, cả quyết định và bàn giao đều hoàn tất qua gọi hàm; một số kênh không hỗ trợ trường tools sẽ báo lỗi. Có hiệu lực toàn cục, không lưu theo hội thoại.">
            <AcuToggle :model-value="runtime.nativeToolEnabled.value" aria-label="Dùng gọi công cụ" @update:model-value="runtime.setNativeToolEnabled($event)" />
          </AcuFormRow>
          <AcuFormRow label="Preset API (mặc định toàn cục)" hint="Tất cả Agent mặc định dùng preset này; khi cần chỉ định riêng cho một Agent, hãy mở «Kênh từng Agent» bên dưới. Agent cần công cụ phải dùng kết nối loại Chat Completion: API tùy chỉnh, preset kết nối SillyTavern Chat Completion hoặc kết nối chính Chat Completion đều được; kết nối Text Completion không trả về được lệnh gọi công cụ.">
            <AcuSelect
              :options="apiPresetOptions"
              :model-value="apiPresetValue"
              :placeholder="followActiveApiLabel"
              @update:model-value="applyApiPreset"
            />
          </AcuFormRow>
          <AcuFormRow label="Ngưỡng tự động tóm tắt phiên (token)" hint="Tính theo toàn bộ ngữ cảnh Agent chính thực sự đọc; vượt ngưỡng sẽ cô đọng các lượt sớm nhất thành báo cáo bàn giao; 0 là không tóm tắt.">
            <AcuInput v-model="settingsDraft.agentHistoryTokenBudget" type="number" :min="0" :max="1000000" />
          </AcuFormRow>
          <AcuFormRow label="Giới hạn đọc mỗi lô" hint="Một lô công cụ read/search được chèn tối đa bao nhiêu token; vượt quá thì trả lại cả lô. Nhập số nguyên dương hoặc phần trăm dạng 20% (quy đổi theo ngưỡng tóm tắt).">
            <AcuInput v-model="settingsDraft.agentReadTokenBudget" type="text" />
          </AcuFormRow>
          <AcuFormRow label="Hạn mức đọc kỹ khi sắp tóm tắt (token)" hint="Khi ngữ cảnh sắp kích hoạt tóm tắt, chỉ các lần đọc một lô không vượt quá kích thước này mới được cho qua.">
            <AcuInput v-model="settingsDraft.agentReadFallbackTokens" type="number" :min="0" :max="100000" />
          </AcuFormRow>
        </div>
        <div class="acu-v2-world-simulation-page__toggles">
          <AcuCheckbox v-model="settingsDraft.autoTriggerEnabled" label="Tự động mô phỏng sau khi nội dung tạo xong (cùng thời điểm với tự động điền bảng)" />
          <AcuCheckbox v-model="settingsDraft.webResearch.enabled" label="Bật nghiên cứu thiết lập (tra cứu bách khoa bên ngoài)" />
        </div>

        <div class="acu-v2-world-simulation-page__groups">
          <AcuDisclosureGroup
            class="acu-v2-world-simulation-page__group"
            label="Ngân sách chạy của Agent"
            :meta="budgetGroupMeta"
            :expanded="isGroupExpanded('budget')"
            body-id="acu-world-simulation-group-budget"
            @toggle="toggleGroup('budget')"
          >
            <div class="acu-v2-world-simulation-page__settings-grid">
              <AcuFormRow label="Giới hạn vòng lặp của Agent chính" hint="Số lần ra quyết định tối đa của Agent chính trong một lần mô phỏng (thu thập chứng cứ/giao việc/hội tụ mỗi loại tính một lần). Phạm vi 1–100.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxIterations" type="number" :min="1" :max="100" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn tổng số lần giao việc" hint="Số tác vụ Agent phụ được giao tối đa trong một lần mô phỏng, 0 là cấm giao việc. Phạm vi 0–100.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxDelegations" type="number" :min="0" :max="100" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn giao việc mỗi Agent" hint="Cùng một Agent phụ được giao tối đa bao nhiêu lần trong một lần mô phỏng. Phạm vi 0–20.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxSameAgent" type="number" :min="0" :max="20" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn giao việc đồng thời" hint="Số Agent phụ chạy đồng thời tối đa trong cùng một đợt; mặc định 5. Giảm xuống khi API giới hạn tốc độ nghiêm ngặt. Phạm vi 1–20.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxConcurrent" type="number" :min="1" :max="20" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn lô đọc" hint="Số lô công cụ read/search tối đa của Agent chính trong một lần mô phỏng, 0 là cấm đọc. Phạm vi 0–200.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxReads" type="number" :min="0" :max="200" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn vòng công cụ của Agent phụ" hint="Ngoài vòng đầu, Agent phụ còn được phép thêm mấy vòng đọc bổ sung read/search. Phạm vi 0–20.">
                <AcuInput v-model="settingsDraft.agentRunBudget.maxExtraReads" type="number" :min="0" :max="20" />
              </AcuFormRow>
            </div>
          </AcuDisclosureGroup>

          <AcuDisclosureGroup
            class="acu-v2-world-simulation-page__group"
            label="Nghiên cứu thiết lập (tra cứu web)"
            :meta="webResearchGroupMeta"
            :expanded="isGroupExpanded('webResearch')"
            body-id="acu-world-simulation-group-web-research"
            @toggle="toggleGroup('webResearch')"
          >
            <p class="acu-v2-world-simulation-page__meta">Khi bật, Agent chính có thể dùng tra cứu web và đọc bách khoa để bổ sung tư liệu thiết lập công khai khi bằng chứng cục bộ không đủ; kết quả nghiên cứu chỉ làm chứng cứ, không ghi trực tiếp vào sổ cái thế giới.</p>
            <div class="acu-v2-world-simulation-page__toggles">
              <AcuCheckbox v-model="settingsDraft.webResearch.sources.moegirl" label="Moegirl" />
              <AcuCheckbox v-model="settingsDraft.webResearch.sources.wikipediaZh" label="Wikipedia tiếng Trung" />
              <AcuCheckbox v-model="settingsDraft.webResearch.sources.wikipediaEn" label="Wikipedia tiếng Anh" />
            </div>
            <div class="acu-v2-world-simulation-page__settings-grid">
              <AcuFormRow label="Công cụ tìm kiếm" hint="Tìm kiếm dự phòng khi bách khoa không tra được. DuckDuckGo không cần key; Serper / Tavily dùng key đã cấu hình trong «Khóa API» của SillyTavern; SearXNG cần nhập địa chỉ instance.">
                <AcuSelect v-model="settingsDraft.webResearch.searchProvider" :options="webSearchProviderOptions" />
              </AcuFormRow>
              <AcuFormRow v-if="settingsDraft.webResearch.searchProvider === 'searxng'" label="Địa chỉ instance SearXNG" hint="Dạng như https://searx.example.org">
                <AcuInput v-model="settingsDraft.webResearch.searxngBaseUrl" type="text" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn số ký tự đọc mỗi trang" hint="Giới hạn nội dung một trang mà Agent phụ nghiên cứu được đọc; nội dung không được lưu. Phạm vi 500–20000.">
                <AcuInput v-model="settingsDraft.webResearch.pageCharLimit" type="number" :min="500" :max="20000" />
              </AcuFormRow>
              <AcuFormRow label="Danh sách đen tên miền" hint="Các tên miền không được thu thập, phân cách bằng dấu phẩy hoặc xuống dòng; mạng nội bộ và chính SillyTavern luôn bị chặn.">
                <AcuTextarea v-model="settingsDraft.webResearch.blockedDomains" :rows="3" />
              </AcuFormRow>
            </div>
          </AcuDisclosureGroup>

          <AcuDisclosureGroup
            class="acu-v2-world-simulation-page__group"
            label="Động thái thế giới"
            :meta="dynamicsGroupMeta"
            :expanded="isGroupExpanded('dynamics')"
            body-id="acu-world-simulation-group-dynamics"
            @toggle="toggleGroup('dynamics')"
          >
            <p class="acu-v2-world-simulation-page__meta">Điều khiển thời hiệu tin đồn, giới hạn đẩy thời gian, hiện thực hóa va chạm và quét hết hạn; thay đổi có hiệu lực từ lượt mô phỏng sau.</p>
            <div class="acu-v2-world-simulation-page__settings-grid">
              <AcuFormRow label="Giới hạn chờ của tin đồn (ngày)" hint="Số ngày tối đa chờ người chơi chạm tới kênh lan truyền sau khi tin đồn vào trạng thái chờ lệnh. Phạm vi 1–3650.">
                <AcuInput v-model="settingsDraft.dynamics.rumorTTLDays" type="number" :min="1" :max="3650" />
              </AcuFormRow>
              <AcuFormRow label="Giới hạn đẩy đồng hồ mỗi lần (ngày thế giới)" hint="Số ngày được phép đẩy trong một lần nộp; vượt quá phải kèm chứng cứ. Phạm vi 0–3650.">
                <AcuInput v-model="settingsDraft.dynamics.maxClockAdvanceDays" type="number" :min="0" :max="3650" />
              </AcuFormRow>
              <AcuFormRow label="Chính sách hiện thực hóa va chạm" hint="Nghiêm ngặt: khi va chạm phải có phản ứng tại chỗ, nếu mô hình không viết thì chương trình bổ sung một chỉ dẫn tối giản, không từ chối nộp. Khoan dung: chỉ ghi cảnh báo.">
                <AcuSelect v-model="settingsDraft.dynamics.collisionEnforcement" :options="collisionEnforcementOptions" />
              </AcuFormRow>
            </div>
            <div class="acu-v2-world-simulation-page__toggles">
              <AcuCheckbox v-model="settingsDraft.dynamics.missedSweepEnabled" label="Bật quét hết hạn (khi tắt, phục tuyến hết hạn sẽ không tự ghi là bỏ lỡ)" />
            </div>
          </AcuDisclosureGroup>

          <AcuDisclosureGroup
            class="acu-v2-world-simulation-page__group"
            label="Chèn tín hiệu ngoài cảnh vào nội dung"
            :meta="projectionGroupMeta"
            :expanded="isGroupExpanded('projection')"
            body-id="acu-world-simulation-group-projection"
            @toggle="toggleGroup('projection')"
          >
            <p class="acu-v2-world-simulation-page__meta">Khi nộp, tín hiệu ngoài cảnh được ghi vào tầng assistant đã đóng băng theo định dạng này. $WORLD_SIGNALS sẽ được thay bằng các tín hiệu chia nhóm theo 【此地此刻】【风闻轶事】【世界暗流】; các chú thích đầu/cuối mà plugin dùng để nhận diện và thay thế đoạn này sẽ tự thêm ở lớp ngoài cùng, không cần viết vào định dạng. Thay đổi có hiệu lực từ lần nộp sau.</p>
            <AcuFormRow label="Định dạng chèn" hint="Phải chứa đúng một lần $WORLD_SIGNALS, tối đa 4000 ký tự. Mặc định dùng container ẩn bọc quanh 〈与此同时〉, ẩn với người đọc khi hiển thị nội dung. Sau khi chèn, tầng đó sẽ tự dựng lại.">
              <AcuTextarea v-model="settingsDraft.projection.template" :rows="6" />
            </AcuFormRow>
            <div class="acu-v2-world-simulation-page__toggles">
              <AcuButton size="sm" @click="restoreDefaultProjectionTemplate">Khôi phục mặc định</AcuButton>
            </div>
          </AcuDisclosureGroup>

          <AcuDisclosureGroup
            class="acu-v2-world-simulation-page__group"
            label="Luồng công việc"
            :meta="workflowGroupMeta"
            :expanded="isGroupExpanded('workflow')"
            body-id="acu-world-simulation-group-workflow"
            @toggle="toggleGroup('workflow')"
          >
            <p class="acu-v2-world-simulation-page__meta">Lô một của luồng công việc cố định xử lý đồng thời thời gian, thang thế cục, phục tuyến và danh sách nhân vật; lô hai xử lý kỷ yếu hậu trường, tin đồn và tín hiệu ngoài cảnh theo thay đổi. Ở đây chỉ sửa ngưỡng tầng nóng của kỷ yếu; prompt vẫn sửa trong các nhóm vai trò bên dưới.</p>
            <div class="acu-v2-world-simulation-page__settings-grid">
              <AcuFormRow label="Ngưỡng tầng nóng của kỷ yếu" hint="Khi kỷ yếu tầng nóng đạt số mục này, lô hai sẽ do vai trò kỷ yếu xử lý lưu trữ. Phạm vi 1–512.">
                <AcuInput v-model="settingsDraft.workflow.chroniclerHotThreshold" type="number" :min="1" :max="512" />
              </AcuFormRow>
            </div>
          </AcuDisclosureGroup>

          <AcuDisclosureGroup
            class="acu-v2-world-simulation-page__group"
            label="Kênh từng Agent"
            :meta="channelGroupMeta"
            :expanded="isGroupExpanded('channels')"
            body-id="acu-world-simulation-group-channels"
            @toggle="toggleGroup('channels')"
          >
            <p class="acu-v2-world-simulation-page__meta">Gán preset API khác nhau cho từng Agent: ví dụ Agent chính dùng mô hình mạnh, Agent phụ duyệt dùng mô hình rẻ và nhanh. «Theo mặc định toàn cục» nghĩa là dùng preset API ở trên. Agent cần công cụ phải dùng kết nối loại Chat Completion: API tùy chỉnh, preset kết nối SillyTavern Chat Completion hoặc kết nối chính Chat Completion đều được; kết nối Text Completion không trả về được lệnh gọi công cụ.</p>
            <div class="acu-v2-world-simulation-page__settings-grid">
              <AcuFormRow v-for="agentName in agentNames" :key="agentName" :label="agentLabel(agentName)">
                <AcuSelect
                  :options="agentChannelOptions"
                  :model-value="agentChannelValue(agentName)"
                  @update:model-value="value => applyAgentChannel(agentName, value)"
                />
              </AcuFormRow>
            </div>
          </AcuDisclosureGroup>
        </div>

        <p v-if="settingsError" class="acu-v2-world-simulation-page__error">{{ settingsError }}</p>
        <p v-if="settingsNotice" class="acu-v2-world-simulation-page__meta">{{ settingsNotice }}</p>
      </AcuPanel>
    </AcuPanelGrid>

    <AcuPanel v-if="settingsDraft" title="Prompt giả Role" description="Chỉ các đoạn được bật mới tham gia lệnh gọi nội bộ; placeholder được phân giải theo nhu cầu khi thực sự xuất hiện. Các đoạn seam của engine có thứ tự và vai trò cố định, không thể xóa; các đoạn còn lại có thể tự do thêm, xóa, sửa. Tự động lưu sau khi sửa.">
      <div class="acu-v2-world-simulation-page__actions acu-v2-world-simulation-page__actions--start">
        <AcuButton @click="exportPrompts">Xuất JSON prompt</AcuButton>
        <AcuButton @click="promptImportInput?.click()">Nhập JSON prompt</AcuButton>
        <input ref="promptImportInput" type="file" accept=".json,application/json" class="acu-v2-world-simulation-page__file-input" @change="onImportPromptsFile" />
      </div>
      <p v-if="promptIoError" class="acu-v2-world-simulation-page__error">{{ promptIoError }}</p>
      <p v-if="promptIoNotice" class="acu-v2-world-simulation-page__meta">{{ promptIoNotice }}</p>

      <div class="acu-v2-world-simulation-page__groups">
        <AcuDisclosureGroup
          v-for="agentName in agentNames"
          :key="agentName"
          class="acu-v2-world-simulation-page__group"
          :label="`Prompt ${agentLabel(agentName)} (${agentName})`"
          :meta="promptGroupMeta(agentName)"
          :expanded="isGroupExpanded(`prompt:${agentName}`)"
          :body-id="`acu-world-simulation-prompt-${agentName}`"
          @toggle="toggleGroup(`prompt:${agentName}`)"
        >
          <AcuPromptSegments
            :segments="runtime.presentPromptSegments(agentName, settingsDraft.agentPrompts[agentName] ?? [])"
            :role-options="roleOptions"
            :show-slot="false"
            :show-enabled="true"
            :allow-move="true"
            @add="position => addPrompt(agentName, position)"
            @delete="index => deletePrompt(agentName, index)"
            @move="(index, delta) => movePrompt(agentName, index, delta)"
            @update="(index, patch) => updatePrompt(agentName, index, patch)"
          />
          <div class="acu-v2-world-simulation-page__actions"><AcuButton @click="restorePrompt(agentName)">Khôi phục giá trị mặc định của {{ agentLabel(agentName) }}</AcuButton></div>
        </AcuDisclosureGroup>

        <AcuDisclosureGroup
          class="acu-v2-world-simulation-page__group"
          label="Tra nhanh placeholder"
          meta="Tham khảo"
          :expanded="isGroupExpanded('prompt:reference')"
          body-id="acu-world-simulation-prompt-reference"
          @toggle="toggleGroup('prompt:reference')"
        >
          <h4 class="acu-v2-world-simulation-page__subheading">Đoạn seam của engine</h4>
          <p class="acu-v2-world-simulation-page__meta">Thứ tự mặc định: system danh tính, hỏi đáp định dạng, hỏi đáp phương pháp và quy trình, snapshot lúc chạy, lịch sử phiên thực, user điền sẵn. Câu trả lời định dạng chỉ đọc, chuyển theo «Dùng gọi công cụ»; mẫu snapshot có thể sửa, tài liệu động được chèn ở đây. Thẻ snapshot và lịch sử có thể dời lên/xuống, lịch sử được mở ra theo danh tính thực.</p>
          <h4 class="acu-v2-world-simulation-page__subheading">Placeholder Mô phỏng thế giới</h4>
          <p class="acu-v2-world-simulation-page__meta">Placeholder lắp ráp lúc chạy: $WORLD_TASK (tác vụ hiện tại), $WORLD_HISTORY (lịch sử phiên Agent neo theo tầng), $WORLD_RUNTIME_CONTEXT (loại kích hoạt, chỉ dẫn và revision sổ cái chuẩn), $WORLD_AGENT_CATALOG (các vai trò có thể giao việc và trách nhiệm), $WORLD_TOOL_CATALOG (bảng từ vựng địa chỉ read/search), $WORLD_EVIDENCE (các mục chứng cứ đã được cấp quyền), $WORLD_USER_REQUIREMENTS (yêu cầu tích lũy của người dùng, chèn mặc định), $WORLD_USER_GUIDANCE (chỉ dẫn của người dùng lượt này, đoạn tùy chỉnh vẫn dùng được). Placeholder miền thế giới: $WORLD_STATE (sổ cái thế giới hiện tại), $ANCHOR_MESSAGE (nội dung tầng assistant đã đóng băng), $ANCHOR_IDENTITY (danh tính tầng / swipe / tóm tắt nội dung), $WORLD_STAGE_PLAN (kế hoạch giai đoạn lượt này), $WORLD_CHRONICLE (biên niên vĩ mô), $WORLD_CANDIDATES (tóm tắt ứng viên lượt này), $CURRENT_EVIDENCE_REGISTRY (snapshot sổ đăng ký chứng cứ), $PROJECTION_PREVIEW (xem trước phép chiếu 〈与此同时〉). Mọi nội dung động đều được chèn dưới dạng khối UNTRUSTED_* đã escape; chỉ placeholder thực sự xuất hiện trong prompt mới được phân giải; placeholder không xác định sẽ bị từ chối khi lưu.</p>
        </AcuDisclosureGroup>
      </div>
      <p v-if="settingsError" class="acu-v2-world-simulation-page__error">{{ settingsError }}</p>
    </AcuPanel>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { isAgentFixedSlot_ACU, isAgentSnapshotSlot_ACU } from '../../shared/agent-prompt-layout';
import { isAgentFormatAnswer_ACU } from '../../shared/agent-prompt-qa';
import type { WorldSimulationAgentName_ACU } from '../../service/simulation/agent/agent-catalog'; // arch-ok: 仅类型导入，用于本页状态标注，编译后无运行时依赖
import type { WorldSimulationPromptSegment_ACU, WorldSimulationSettings_ACU } from '../../service/simulation/model'; // arch-ok: 仅类型导入，用于本页状态标注，编译后无运行时依赖
import AcuButton from '../components/_lib/AcuButton.vue';
import AcuCheckbox from '../components/_lib/AcuCheckbox.vue';
import AcuToggle from '../components/_lib/AcuToggle.vue';
import AcuDisclosureGroup from '../components/_lib/AcuDisclosureGroup.vue';
import AcuFormRow from '../components/_lib/AcuFormRow.vue';
import AcuInput from '../components/_lib/AcuInput.vue';
import AcuPanel from '../components/_lib/AcuPanel.vue';
import AcuPanelGrid from '../components/_lib/AcuPanelGrid.vue';
import AcuPromptSegments from '../components/_lib/AcuPromptSegments.vue';
import AcuSelect from '../components/_lib/AcuSelect.vue';
import AcuTextarea from '../components/_lib/AcuTextarea.vue';
import WorldSimulationChat from '../components/WorldSimulationChat.vue';
import WorldSimulationMaterialsPanel from '../components/WorldSimulationMaterialsPanel.vue';
import { useApiPresetSelectOptions } from '../composables/useApiPresetSelectOptions';
import { useChatChangedTick, useChatMutationTick } from '../composables/useChatChangedListener';
import { useWorldSimulationRuntime } from '../composables/useWorldSimulationRuntime';
import { WORLD_SIMULATION_AGENT_ORDER_ACU, worldSimulationAgentLabel_ACU } from '../copy/world-simulation-copy';
import { useDialogStore } from '../stores/dialog-store';

const runtime = useWorldSimulationRuntime();
const dialog = useDialogStore();
const { apiStore, followActiveApiLabel, apiPresetSelectOptions: apiPresetOptions } = useApiPresetSelectOptions();
const settingsDraft = ref<WorldSimulationSettings_ACU | null>(null);
const messageDraft = ref('');
const messageSending = ref(false);
const settingsError = ref('');
const settingsNotice = ref('');

const agentNames = WORLD_SIMULATION_AGENT_ORDER_ACU;
const agentLabel = worldSimulationAgentLabel_ACU;

const roleOptions = [
  { value: 'system', label: 'SYSTEM' },
  { value: 'user', label: 'USER' },
  { value: 'assistant', label: 'ASSISTANT' },
];

const webSearchProviderOptions = [
  { value: 'duckduckgo', label: 'DuckDuckGo (không cần key)' },
  { value: 'serper', label: 'Serper (Google, cần SillyTavern đã cấu hình key)' },
  { value: 'tavily', label: 'Tavily (cần SillyTavern đã cấu hình key)' },
  { value: 'searxng', label: 'SearXNG (tự dựng/instance công cộng)' },
];

const collisionEnforcementOptions = [
  { value: 'strict', label: 'Nghiêm ngặt (chưa hiện thực hóa thì từ chối nộp)' },
  { value: 'relaxed', label: 'Khoan dung (chỉ cảnh báo)' },
];

/** 渠道下拉里「跟随全局默认」的哨兵值：空串已被「跟随当前活动 API」占用。 */
const INHERIT_CHANNEL_VALUE = '__inherit__';

const apiPresetValue = computed(() => {
  if (!settingsDraft.value) return '';
  return settingsDraft.value.apiPresetMode === 'fixed' ? settingsDraft.value.fixedApiPresetName : '';
});

function applyApiPreset(value: string): void {
  if (!settingsDraft.value) return;
  const trimmed = String(value || '').trim();
  if (trimmed) {
    settingsDraft.value.apiPresetMode = 'fixed';
    settingsDraft.value.fixedApiPresetName = trimmed;
  } else {
    settingsDraft.value.apiPresetMode = 'current';
    settingsDraft.value.fixedApiPresetName = '';
  }
  // 渠道选择与智能续写一致：选择即保存，不等防抖窗口，避免用户离开页面时选择丢失。
  saveSettingsImmediately();
}

const agentChannelOptions = computed(() => [
  { value: INHERIT_CHANNEL_VALUE, label: 'Theo mặc định toàn cục' },
  ...apiPresetOptions.value,
]);

/** 格林推演的渠道映射以「键不存在」表示跟随全局默认，与 settings validator 的闭合契约一致。 */
function agentChannelValue(agentName: WorldSimulationAgentName_ACU): string {
  const choice = settingsDraft.value?.agentApiPresets[agentName];
  if (!choice) return INHERIT_CHANNEL_VALUE;
  return choice.mode === 'fixed' ? choice.presetName : '';
}

function applyAgentChannel(agentName: WorldSimulationAgentName_ACU, value: string): void {
  if (!settingsDraft.value) return;
  const trimmed = String(value ?? '').trim();
  const next = { ...settingsDraft.value.agentApiPresets };
  if (trimmed === INHERIT_CHANNEL_VALUE) delete next[agentName];
  else if (trimmed) next[agentName] = { mode: 'fixed', presetName: trimmed };
  else next[agentName] = { mode: 'current', presetName: '' };
  settingsDraft.value.agentApiPresets = next;
  saveSettingsImmediately();
}

/** 折叠分组的展开状态：默认全部收起，只在本次打开面板期间记忆。 */
const expandedGroups = reactive<Record<string, boolean>>({});

function isGroupExpanded(key: string): boolean {
  return expandedGroups[key] === true;
}

function toggleGroup(key: string): void {
  expandedGroups[key] = !isGroupExpanded(key);
}

/** 折叠态下的一行摘要：让用户不展开也能看到关键取值。 */
const budgetGroupMeta = computed(() => {
  const s = settingsDraft.value;
  if (!s) return '';
  return `Vòng lặp ${s.agentRunBudget.maxIterations} · giao việc ${s.agentRunBudget.maxDelegations} · đồng thời ${s.agentRunBudget.maxConcurrent}`;
});

const webResearchGroupMeta = computed(() => {
  const web = settingsDraft.value?.webResearch;
  if (!web) return '';
  if (!web.enabled) return 'Đã tắt';
  const sources = [web.sources.moegirl && 'Moegirl', web.sources.wikipediaZh && 'Wikipedia TQ', web.sources.wikipediaEn && 'Wikipedia Anh'].filter(Boolean);
  return `Đã bật · ${sources.length ? sources.join('/') : 'Không có nguồn bách khoa'} · ${web.searchProvider}`;
});

const channelGroupMeta = computed(() => {
  const presets = settingsDraft.value?.agentApiPresets;
  if (!presets) return '';
  const customized = agentNames.filter(name => presets[name] !== undefined).length;
  return customized ? `${customized} chỉ định riêng` : 'Tất cả theo mặc định';
});

const dynamicsGroupMeta = computed(() => {
  const dynamics = settingsDraft.value?.dynamics;
  if (!dynamics) return '';
  return `TTL ${dynamics.rumorTTLDays} · đẩy ${dynamics.maxClockAdvanceDays} · ${dynamics.collisionEnforcement === 'strict' ? 'Nghiêm ngặt' : 'Khoan dung'}${dynamics.missedSweepEnabled ? ' · quét bật' : ' · quét tắt'}`;
});

const projectionGroupMeta = computed(() => {
  const projection = settingsDraft.value?.projection;
  if (!projection) return '';
  return projection.template === runtime.defaultProjectionTemplate ? 'Định dạng mặc định' : 'Định dạng tùy chỉnh';
});

function restoreDefaultProjectionTemplate(): void {
  if (settingsDraft.value) settingsDraft.value.projection.template = runtime.defaultProjectionTemplate;
}

const workflowGroupMeta = computed(() => {
  const workflow = settingsDraft.value?.workflow;
  if (!workflow) return '';
  return `Tầng nóng biên niên ${workflow.chroniclerHotThreshold}`;
});

function cloneSettings(settings: WorldSimulationSettings_ACU): WorldSimulationSettings_ACU {
  return JSON.parse(JSON.stringify(settings)) as WorldSimulationSettings_ACU;
}

/** 首次发送（即将创建任务）前的高 RPM 风险确认：5 秒倒计时结束前只能取消。 */
async function confirmFirstSendRpmWarning(): Promise<boolean> {
  return dialog.confirm({
    title: 'Vui lòng xác nhận trước khi bắt đầu Mô phỏng thế giới',
    message: 'Mỗi yêu cầu của chức năng này tốn không nhiều Token, nhưng Agent sẽ liên tục phát ra rất nhiều yêu cầu, cần API hỗ trợ RPM (số yêu cầu mỗi phút) rất cao. Sau khi bật «Tự động mô phỏng», mỗi lần nội dung tạo xong sẽ chạy thêm một lượt.',
    dangerMessage: 'Cấm dùng bất kỳ trạm công ích nào, trừ khi nó nói rõ cho phép coding (mô hình yêu cầu của chức năng này tương tự coding). Dùng sai quy định có thể khiến tài khoản bị khóa.',
    confirmLabel: 'Tôi đã hiểu, bắt đầu',
    cancelLabel: 'Hủy',
    confirmVariant: 'danger',
    confirmCountdownSeconds: 5,
  });
}

/** 会话发送：没有任务时创建任务，运行中会打断当前 run 并带着这句话继续或新建。 */
async function sendMessage(text: string): Promise<void> {
  if (messageSending.value) return;
  if (!runtime.task.value && !(await confirmFirstSendRpmWarning())) return;
  if (messageSending.value) return;
  messageSending.value = true;
  try {
    const accepted = await runtime.send(text);
    if (accepted && messageDraft.value.trim() === text) messageDraft.value = '';
  } finally {
    messageSending.value = false;
  }
}

async function clearData(): Promise<void> {
  await runtime.clearData();
}

function requiredRangeInteger(value: unknown, label: string, minimum: number, maximum: number): number {
  const numeric = typeof value === 'number' ? value : Number(String(value ?? '').trim());
  if (!Number.isInteger(numeric) || numeric < minimum || numeric > maximum) throw new Error(`${label} phải là số nguyên từ ${minimum} đến ${maximum}`);
  return numeric;
}

/** 读取预算接受两种形态：正整数（固定 token 数）或 1%-100% 的百分比串（按总结阈值折算）。 */
function normalizedReadBudget(value: unknown): number | string {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('Giới hạn đọc mỗi lô không được để trống');
  if (raw.endsWith('%')) {
    const percent = Number.parseInt(raw, 10);
    if (!Number.isInteger(percent) || percent < 1 || percent > 100 || `${percent}%` !== raw) throw new Error('Phần trăm ngân sách đọc phải là số nguyên phần trăm từ 1% đến 100%');
    return `${percent}%`;
  }
  const fixed = Number(raw);
  if (!Number.isInteger(fixed) || fixed < 1 || fixed > 1000000) throw new Error('Giới hạn đọc mỗi lô phải là số nguyên từ 1 đến 1000000, hoặc phần trăm dạng 20%');
  return fixed;
}

/** 判断预设名是否存在于当前 API 预设列表中：把悬挂引用从运行中途的任务失败提前到保存时报错。 */
function presetExists(presetName: string): boolean {
  return apiStore.presets.some(preset => preset.name === presetName);
}

function normalizeSettingsDraft(): WorldSimulationSettings_ACU {
  if (!settingsDraft.value) throw new Error('Cài đặt Mô phỏng thế giới chưa được tải');
  const source = settingsDraft.value;
  const normalized: WorldSimulationSettings_ACU = {
    ...cloneSettings(source),
    agentHistoryTokenBudget: requiredRangeInteger(source.agentHistoryTokenBudget, 'Ngưỡng tự động tóm tắt phiên', 0, 1000000),
    agentReadTokenBudget: normalizedReadBudget(source.agentReadTokenBudget),
    agentReadFallbackTokens: requiredRangeInteger(source.agentReadFallbackTokens, 'Hạn mức đọc kỹ khi sắp tóm tắt', 0, 100000),
    agentRunBudget: {
      maxIterations: requiredRangeInteger(source.agentRunBudget.maxIterations, 'Giới hạn vòng lặp của Agent chính', 1, 100),
      maxDelegations: requiredRangeInteger(source.agentRunBudget.maxDelegations, 'Giới hạn tổng số lần giao việc', 0, 100),
      maxSameAgent: requiredRangeInteger(source.agentRunBudget.maxSameAgent, 'Giới hạn giao việc mỗi Agent', 0, 20),
      maxConcurrent: requiredRangeInteger(source.agentRunBudget.maxConcurrent, 'Giới hạn giao việc đồng thời', 1, 20),
      maxReads: requiredRangeInteger(source.agentRunBudget.maxReads, 'Giới hạn lô đọc', 0, 200),
      maxExtraReads: requiredRangeInteger(source.agentRunBudget.maxExtraReads, 'Giới hạn vòng công cụ của Agent phụ', 0, 20),
    },
    webResearch: {
      enabled: source.webResearch.enabled,
      sources: { ...source.webResearch.sources },
      searchProvider: source.webResearch.searchProvider,
      searxngBaseUrl: String(source.webResearch.searxngBaseUrl ?? '').trim(),
      pageCharLimit: requiredRangeInteger(source.webResearch.pageCharLimit, 'Giới hạn số ký tự đọc mỗi trang', 500, 20000),
      blockedDomains: String(source.webResearch.blockedDomains ?? ''),
    },
    dynamics: {
      rumorTTLDays: requiredRangeInteger(source.dynamics.rumorTTLDays, 'Giới hạn chờ của tin đồn', 1, 3650),
      maxClockAdvanceDays: requiredRangeInteger(source.dynamics.maxClockAdvanceDays, 'Giới hạn đẩy đồng hồ mỗi lần', 0, 3650),
      collisionEnforcement: source.dynamics.collisionEnforcement === 'relaxed' ? 'relaxed' : source.dynamics.collisionEnforcement === 'strict' ? 'strict' : (() => { throw new Error('Chính sách hiện thực hóa va chạm phải là nghiêm ngặt hoặc khoan dung'); })(),
      missedSweepEnabled: typeof source.dynamics.missedSweepEnabled === 'boolean' ? source.dynamics.missedSweepEnabled : (() => { throw new Error('Công tắc quét hết hạn không hợp lệ'); })(),
    },
    workflow: {
      chroniclerHotThreshold: requiredRangeInteger(source.workflow?.chroniclerHotThreshold, 'Ngưỡng tầng nóng biên niên', 1, 512),
    },
    projection: {
      template: (() => {
        const template = String(source.projection?.template ?? '');
        const problem = runtime.projectionTemplateError(template);
        if (problem) throw new Error(problem);
        return template;
      })(),
    },
  };
  if (normalized.webResearch.enabled && normalized.webResearch.searchProvider === 'searxng' && !normalized.webResearch.searxngBaseUrl) {
    throw new Error('Khi chọn công cụ tìm kiếm SearXNG phải nhập địa chỉ instance');
  }
  if (normalized.apiPresetMode === 'fixed') {
    const presetName = normalized.fixedApiPresetName.trim();
    if (!presetName) throw new Error('Tên preset API cố định không được để trống');
    if (!presetExists(presetName)) throw new Error(`Preset API "${presetName}" không tồn tại, vui lòng chọn lại`);
  }
  for (const agentName of agentNames) {
    const choice = normalized.agentApiPresets[agentName];
    if (!choice || choice.mode !== 'fixed') continue;
    const presetName = choice.presetName.trim();
    if (!presetName) throw new Error(`Kênh cố định của ${agentLabel(agentName)} phải chọn preset`);
    if (!presetExists(presetName)) throw new Error(`Preset API "${presetName}" của kênh ${agentLabel(agentName)} không tồn tại, vui lòng chọn lại`);
  }
  return normalized;
}

/** 记录最近一次从权威状态装载/保存成功的草稿快照，用于跳过无变化的自动保存并切断"保存→刷新→重建草稿"的循环。 */
let lastPersistedSettingsJson = '';
let settingsSaveTimer: ReturnType<typeof setTimeout> | undefined;

/** 设置修改后自动保存（防抖 800ms），与智能续写/填表工作台的"改动即生效"一致。 */
function scheduleSettingsSave(): void {
  if (settingsSaveTimer !== undefined) clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => { void saveSettingsNow(); }, 800);
}

/** 立即触发保存：先取消挂起的防抖计时器再保存，保证渠道类改动不受 800ms 窗口影响。 */
function saveSettingsImmediately(): void {
  if (settingsSaveTimer !== undefined) {
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = undefined;
  }
  void saveSettingsNow();
}

async function saveSettingsNow(): Promise<void> {
  if (!settingsDraft.value) return;
  if (JSON.stringify(settingsDraft.value) === lastPersistedSettingsJson) return;
  let candidate: WorldSimulationSettings_ACU;
  try {
    apiStore.refreshFromSettings();
    candidate = normalizeSettingsDraft();
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : 'Cài đặt Mô phỏng thế giới không hợp lệ';
    return;
  }
  const outcome = await runtime.saveSettings(candidate);
  if (outcome === 'saved') {
    settingsError.value = '';
    settingsNotice.value = '';
  } else if (outcome === 'busy') {
    // Agent 正在运行，改动不能丢：告知用户并排队等本轮结束后落盘。
    settingsNotice.value = 'Đã sửa cài đặt: Mô phỏng thế giới đang chạy, sẽ tự động lưu sau khi lượt này kết thúc và có hiệu lực từ lượt sau.';
    scheduleSettingsSave();
  }
}

/** 折叠态摘要：启用段数 / 总段数。 */
function promptGroupMeta(agentName: WorldSimulationAgentName_ACU): string {
  const prompts = settingsDraft.value?.agentPrompts[agentName];
  if (!prompts) return '';
  const enabled = prompts.filter(segment => segment.enabled !== false).length;
  return `${enabled}/${prompts.length} đoạn được bật`;
}

function promptList(agentName: WorldSimulationAgentName_ACU): WorldSimulationPromptSegment_ACU[] | null {
  return settingsDraft.value?.agentPrompts[agentName] ?? null;
}

function addPrompt(agentName: WorldSimulationAgentName_ACU, position: 'top' | 'bottom' = 'bottom'): void {
  const prompts = promptList(agentName);
  if (!prompts) return;
  const segment: WorldSimulationPromptSegment_ACU = { role: 'user', content: 'Vui lòng nhập nội dung prompt.', enabled: true, deletable: true, pinned: false };
  if (position === 'top') prompts.unshift(segment);
  else prompts.push(segment);
}

function deletePrompt(agentName: WorldSimulationAgentName_ACU, index: number): void {
  const prompts = promptList(agentName);
  if (!prompts || prompts[index]?.deletable === false || isAgentFormatAnswer_ACU(prompts[index])) return;
  prompts.splice(index, 1);
}

/** 固定插入卡可移动；其他 pinned 段仍保持引擎顺序。 */
function movePrompt(agentName: WorldSimulationAgentName_ACU, index: number, delta: -1 | 1): void {
  const prompts = promptList(agentName);
  const target = index + delta;
  if (!prompts || target < 0 || target >= prompts.length) return;
  if (isAgentFormatAnswer_ACU(prompts[index]) || isAgentFormatAnswer_ACU(prompts[target])) return;
  if (!isAgentFixedSlot_ACU(prompts[index]) && !isAgentFixedSlot_ACU(prompts[target]) && (prompts[index]?.pinned || prompts[target]?.pinned)) return;
  [prompts[index], prompts[target]] = [prompts[target], prompts[index]];
}

/** pinned 段只允许改内容：角色、启用与可删除性由引擎 seam 契约固定。 */
function updatePrompt(agentName: WorldSimulationAgentName_ACU, index: number, patch: Partial<WorldSimulationPromptSegment_ACU>): void {
  const prompts = promptList(agentName);
  const current = prompts?.[index];
  if (!prompts || !current) return;
  if (isAgentFormatAnswer_ACU(current)) return;
  if (isAgentFixedSlot_ACU(current)) {
    if (isAgentSnapshotSlot_ACU(current) && typeof patch.snapshotTemplate === 'string') prompts[index] = { ...current, snapshotTemplate: patch.snapshotTemplate };
    return;
  }
  prompts[index] = current.pinned
    ? { ...current, ...(typeof patch.content === 'string' ? { content: patch.content } : {}) }
    : { ...current, ...patch, pinned: false };
}

function restorePrompt(agentName: WorldSimulationAgentName_ACU): void {
  if (!settingsDraft.value) return;
  settingsDraft.value = runtime.restorePromptDefault(settingsDraft.value, agentName);
}

const promptImportInput = ref<HTMLInputElement | null>(null);
const promptIoError = ref('');
const promptIoNotice = ref('');

/** 导出全部八组 Agent 提示词为 JSON 文件下载。 */
function exportPrompts(): void {
  if (!settingsDraft.value) return;
  promptIoError.value = '';
  try {
    const bundle = { version: 1, agentPrompts: cloneSettings(settingsDraft.value).agentPrompts };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'acu-world-simulation-prompts.json';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    promptIoNotice.value = 'Đã xuất JSON prompt.';
  } catch (error) {
    promptIoError.value = error instanceof Error ? error.message : 'Xuất prompt thất bại.';
  }
}

/** 导入提示词 JSON：八组全部校验通过后整体写入草稿并立即保存，任何一组失败即整体拒绝。 */
async function onImportPromptsFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // 允许连续选择同一个文件重复导入。
  input.value = '';
  if (!file || !settingsDraft.value) return;
  promptIoError.value = '';
  promptIoNotice.value = '';
  try {
    settingsDraft.value.agentPrompts = runtime.parsePromptBundle(await file.text());
    saveSettingsImmediately();
    promptIoNotice.value = 'Đã nhập và lưu JSON prompt.';
  } catch (error) {
    promptIoError.value = error instanceof Error ? error.message : 'Đọc JSON prompt thất bại.';
  }
}

/** 刷新页面依赖的全部数据源：API 预设列表必须在挂载与聊天切换时重新读取，否则预设下拉是空的。 */
function refreshAll(): void {
  apiStore.refreshFromSettings();
  runtime.refresh();
  void runtime.initialize();
}

/**
 * 当前聊天内楼层被删除 / swipe 后：任务锚点、Agent 会话与资料快照都锚定在楼层上，
 * 存储层已随楼层回退，会话流必须清空重灌，否则显示的仍是删楼前的记录。
 */
function refreshAfterChatMutation(): void {
  runtime.resyncAfterChatMutation();
}

onMounted(() => {
  apiStore.refreshFromSettings();
  runtime.refresh();
  void runtime.initialize();
});
onBeforeUnmount(() => {
  // 防抖窗口内离开页面时冲刷一次未落盘的改动，避免"改了像改了、重进没了"。
  if (settingsSaveTimer !== undefined) {
    clearTimeout(settingsSaveTimer);
    settingsSaveTimer = undefined;
    void saveSettingsNow();
  }
});
watch(useChatChangedTick(), refreshAll);
watch(useChatMutationTick(), refreshAfterChatMutation);
watch(runtime.settings, settings => {
  // 每次刷新快照都会产生新的 settings 引用；只有持久化内容真的变了（保存成功、切换聊天）
  // 才重建草稿。否则运行期间的每次状态刷新都会把用户尚未保存的改动悄悄冲掉。
  const persistedJson = settings ? JSON.stringify(cloneSettings(settings)) : '';
  if (persistedJson === lastPersistedSettingsJson && settingsDraft.value) return;
  settingsDraft.value = settings ? cloneSettings(settings) : null;
  lastPersistedSettingsJson = persistedJson;
}, { immediate: true });
watch(settingsDraft, () => {
  if (!settingsDraft.value) return;
  if (JSON.stringify(settingsDraft.value) === lastPersistedSettingsJson) return;
  scheduleSettingsSave();
}, { deep: true });
</script>

<style scoped>
.acu-v2-world-simulation-page { min-height: 100%; padding: 20px; display: grid; gap: 18px; }
.acu-v2-world-simulation-page__layout { align-items: start; }
.acu-v2-world-simulation-page__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.acu-v2-world-simulation-page__actions--start { justify-content: flex-start; margin-top: 0; margin-bottom: 12px; }
.acu-v2-world-simulation-page__file-input { display: none; }
.acu-v2-world-simulation-page__error { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; color: var(--acu-danger, #d65b5b); white-space: pre-wrap; }
.acu-v2-world-simulation-page__meta { margin: 0; color: var(--acu-text-3); font-size: var(--acu-font-size-body, 12px); white-space: pre-wrap; }
.acu-v2-world-simulation-page__settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: start; }
.acu-v2-world-simulation-page__toggles { display: flex; flex-wrap: wrap; gap: 14px; margin: 14px 0; }
.acu-v2-world-simulation-page__groups { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.acu-v2-world-simulation-page__group {
  border: 1px solid var(--acu-border, color-mix(in srgb, var(--acu-text-3) 18%, transparent));
  border-radius: var(--acu-radius-sm);
  background: color-mix(in srgb, var(--acu-bg-2) 72%, transparent);
}
.acu-v2-world-simulation-page__group :deep(.acu-disclosure-group__header) { border-radius: var(--acu-radius-sm); }
.acu-v2-world-simulation-page__group :deep(.acu-disclosure-group--expanded .acu-disclosure-group__header) { border-bottom-left-radius: 0; border-bottom-right-radius: 0; }
.acu-v2-world-simulation-page__group :deep(.acu-disclosure-group__body) { gap: 12px; padding: 12px; }
.acu-v2-world-simulation-page__group :deep(.acu-disclosure-group__meta) { max-width: 55%; overflow: hidden; text-overflow: ellipsis; }
.acu-v2-world-simulation-page__group .acu-v2-world-simulation-page__actions { margin-top: 0; }
.acu-v2-world-simulation-page__subheading { margin: 4px 0 0; color: var(--acu-text-2); font-size: var(--acu-font-size-body, 12px); font-weight: 600; }
.acu-v2-world-simulation-page__subheading:first-child { margin-top: 0; }
@media (max-width: 860px) { .acu-v2-world-simulation-page { padding: 14px; } }
@media (max-width: 640px) {
  .acu-v2-world-simulation-page { padding: 10px; gap: 12px; }
  .acu-v2-world-simulation-page__settings-grid { grid-template-columns: 1fr; }
  .acu-v2-world-simulation-page__actions > * { flex: 1 1 auto; }
  .acu-v2-world-simulation-page__group :deep(.acu-disclosure-group__meta) { display: none; }
}
</style>
