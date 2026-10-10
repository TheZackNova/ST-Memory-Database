// main-popup-worldbook.ts
// Worldbook标签页（世界书）HTML生成

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

/**
 * 生成 Worldbook 标签页的 HTML 片段
 * 包含：世界书设置、注入目标、来源选择、条目管理
 */
export function generateWorldbookTabHTML(): string {
    return `
                <div id="acu-tab-worldbook" class="acu-tab-content">
                    <div class="acu-card">
                        <h3>Cài đặt sổ thế giới</h3>
                        <div>
                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target">Đích chèn dữ liệu:</label>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target-filter" placeholder="Lọc sổ thế giới..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--acu-border-2); background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                            <div class="input-group">
                                <select id="${SCRIPT_ID_PREFIX_ACU}-worldbook-injection-target" style="width: 100%;"></select>
                            </div>
                            <small class="notes">Chọn sổ thế giới mà các mục cơ sở dữ liệu (như toàn cục, nhân vật, dàn ý...) sẽ được tạo hoặc cập nhật vào.</small>
                        </div>
                        <div class="qrf_settings_block checkbox-group" style="margin-top: 12px; margin-bottom: 6px;">
                            <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-outline-entry-enabled">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-outline-entry-enabled"><strong>Chế độ chiếm 0TK</strong></label>
                        </div>
                        <hr style="border-color: var(--acu-border-2); margin: 15px 0;">
                         <div class="qrf_settings_block_radio">
                            <label>Nguồn sổ thế giới (để AI đọc ngữ cảnh):</label>
                            <div class="qrf_radio_group">
                                <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-character" name="${SCRIPT_ID_PREFIX_ACU}-worldbook-source" value="character" checked>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-character">Gắn với thẻ nhân vật</label>
                                <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-manual" name="${SCRIPT_ID_PREFIX_ACU}-worldbook-source" value="manual">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-source-manual">Chọn thủ công</label>
                            </div>
                        </div>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-manual-select-block" style="display: none; margin-top: 10px;">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-worldbook-select">Chọn sổ thế giới (chọn nhiều):</label>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-select-filter" placeholder="Lọc sổ thế giới..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--acu-border-2); background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                            <div class="input-group">
                                <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-select" class="qrf_worldbook_list"></div>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-refresh-worldbooks" title="Làm mới danh sách sổ thế giới">Làm mới</button>
                            </div>
                        </div>
                        <div style="margin-top: 15px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                                <label style="margin-bottom: 0;">Mục sổ thế giới được bật:</label>
                                <div class="button-group" style="margin: 0;">
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-select-all" class="button" style="padding: 2px 8px; font-size: 0.8em;">Chọn tất cả</button>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-worldbook-deselect-all" class="button" style="padding: 2px 8px; font-size: 0.8em;">Bỏ chọn tất cả</button>
                                </div>
                            </div>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-worldbook-entry-filter" placeholder="Lọc mục/sổ thế giới..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--acu-border-2); background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                            <div id="${SCRIPT_ID_PREFIX_ACU}-worldbook-entry-list" class="qrf_worldbook_entry_list">
                                <!-- 条目将动态加载于此 -->
                            </div>
                        </div>
                    </div>
                </div>`;
}