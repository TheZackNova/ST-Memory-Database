// main-popup-prompt.ts
// Prompt标签页（AI指令预设）HTML生成

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

/**
 * 生成 Prompt 标签页的 HTML 片段
 * 包含：数据库更新预设（任务指令）
 */
export function generatePromptTabHTML(): string {
    return `
                <div id="acu-tab-prompt" class="acu-tab-content">
                    <div class="acu-card">
                        <h3>Preset cập nhật cơ sở dữ liệu (chỉ thị tác vụ)</h3>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-prompt-constructor-area">
                            <div class="button-group" style="margin-bottom: 10px; justify-content: center;"><button class="${SCRIPT_ID_PREFIX_ACU}-add-prompt-segment-btn" data-position="top" title="Thêm lượt hội thoại ở trên">+</button></div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-prompt-segments-container">
                                <!-- Segments will be dynamically inserted here -->
                            </div>
                            <div class="button-group" style="margin-top: 10px; justify-content: center;"><button class="${SCRIPT_ID_PREFIX_ACU}-add-prompt-segment-btn" data-position="bottom" title="Thêm lượt hội thoại ở dưới">+</button></div>
                        </div>
                        <div class="button-group">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-save-char-card-prompt" class="primary">Lưu</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-load-char-card-prompt-from-json">Đọc mẫu JSON</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-char-card-prompt-to-json">Xuất mẫu JSON</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-reset-char-card-prompt">Khôi phục mặc định</button>
                        </div>
                    </div>
                </div>`;
}