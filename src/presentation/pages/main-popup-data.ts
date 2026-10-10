// main-popup-data.ts
// Data标签页（数据管理）HTML生成

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';
import { DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU } from '../../shared/template-preset-utils';

/**
 * 生成 Data 标签页的 HTML 片段
 * 包含：数据隔离、数据管理、模板预设、纪要合并
 */
export function generateDataTabHTML(): string {
    return `
                <div id="acu-tab-data" class="acu-tab-content">
                    <div class="acu-card">
                        <h3>Cô lập dữ liệu</h3>
                        <p class="notes">Nhập mã định danh cụ thể tại đây, plugin sẽ chỉ đọc và lưu dữ liệu mang mã định danh đó. Nếu để trống sẽ dùng dữ liệu mặc định.</p>
                        <div class="setting-item" style="margin-bottom: 15px; border-bottom: 1px dashed var(--acu-border-2); padding-bottom: 15px;">
                            <div id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-input-area" style="margin-top: 10px;">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-data-isolation-code">Mã định danh:</label>
                                <div class="acu-data-isolation-row" style="display: flex; gap: 10px; margin-top: 5px; align-items: flex-start;">
                                    <div id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-combo" style="position: relative; flex-grow: 1; display: flex; align-items: center;">
                                        <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-code" placeholder="Nhập mã định danh (để trống thì không cô lập)" style="flex-grow: 1; padding-right: 36px;">
                                        <button type="button" id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-toggle" title="Mã định danh trước đây" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); border: 1px solid var(--acu-border-2); background: var(--acu-bg-1); color: var(--acu-text-1); padding: 4px 6px; border-radius: 4px; cursor: pointer; font-size: 12px; line-height: 1;">▼</button>
                                        <ul id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-history-list" style="display: none; position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: var(--acu-bg-0); border: 1px solid var(--acu-border-2); border-radius: 6px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18); list-style: none; margin: 0; padding: 6px 0; max-height: 220px; overflow-y: auto; z-index: 9999;"></ul>
                                    </div>
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-save" class="primary" style="white-space: nowrap;">Lưu và áp dụng</button>
                                </div>
                                <p class="notes" style="margin-top: 5px;">Sau khi nhập mã và bấm lưu, dữ liệu cục bộ tương ứng sẽ được tải lại.</p>
                            </div>
                            <div style="margin-top: 10px; text-align: right;">
                        <button id="${SCRIPT_ID_PREFIX_ACU}-data-isolation-delete-entries" class="btn-danger" style="padding: 5px 10px; border-radius: 4px; font-size: 0.9em;">Xóa các mục đã chèn của mã định danh hiện tại</button>
                            </div>
                        </div>

                        <h3>Quản lý dữ liệu</h3>
                        <p class="notes">Nhập/xuất cơ sở dữ liệu của hội thoại hiện tại, hoặc quản lý mẫu toàn cục.</p>
                        <div class="button-group acu-data-mgmt-buttons acu-cols-2">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-combined-settings" class="primary">Nhập gộp (mẫu + chỉ thị)</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-combined-settings" class="primary">Xuất gộp (mẫu + chỉ thị)</button>
                        </div>
                        <hr style="border-color: var(--acu-border-2); margin: 15px 0;">
                        <div class="button-group acu-data-mgmt-buttons acu-cols-3">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-json-data">Xuất dữ liệu JSON</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-reset-all-defaults" class="btn-warning">Khôi phục mẫu và prompt mặc định</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-override-with-template" class="btn-danger">Mẫu ghi đè dữ liệu tầng mới nhất</button>
                        </div>
                        <hr style="border-color: var(--acu-border-2); margin: 15px 0;">
                        <div class="acu-template-presets" style="background: var(--acu-bg-2); padding: 12px; border-radius: 8px;">
                            <h4 style="margin: 0 0 10px 0; font-size: 0.95em; font-weight: 600;">Preset mẫu bảng (toàn cục / cuộc trò chuyện hiện tại)</h4>
                            <div class="acu-data-template-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; align-items: start;">
                                <div style="padding: 16px; background: var(--acu-bg-1); border-radius: 8px; border: 1px solid var(--acu-border); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--acu-text-1);">Đang dùng toàn cục</div>
                                            <small id="${SCRIPT_ID_PREFIX_ACU}-template-global-scope-status" class="notes">Cuộc trò chuyện mới sẽ mặc định kế thừa mẫu bảng ở đây</small>
                                        </div>
                                        <span style="padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--accent-primary) 12%, transparent); color: var(--accent-primary); font-size: 12px; font-weight: 600;">Toàn cục</span>
                                    </div>
                                    <div class="qrf_settings_block" style="margin-bottom: 0;">
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-template-preset-select" style="font-weight: 500;">Preset mẫu toàn cục</label>
                                        <select id="${SCRIPT_ID_PREFIX_ACU}-template-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                            <option value="${DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU}">Preset mặc định</option>
                                        </select>
                                    </div>
                                    <div class="acu-template-preset-toolbar" style="display: flex; flex-direction: column; gap: 10px;">
                                        <div class="acu-template-preset-left">
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-template" class="acu-mini-btn" title="Nhập mẫu vào thư viện mẫu toàn cục và chuyển thành mẫu toàn cục hiện tại; các cuộc trò chuyện đã có preset cục bộ sẽ không bị tự động xóa.">
                                                <i class="fa-solid fa-file-import"></i><span>Nhập</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-export-template" class="acu-mini-btn" title="Xuất mẫu toàn cục hiện tại (ưu tiên xuất preset toàn cục đang chọn)">
                                                <i class="fa-solid fa-file-export"></i><span>Xuất</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-reset-template" class="acu-mini-btn" title="Khôi phục mẫu toàn cục mặc định; các cuộc trò chuyện chưa lưu cục bộ hoặc nhập sẽ tiếp tục theo mẫu toàn cục.">
                                                <i class="fa-solid fa-undo"></i><span>Khôi phục mặc định</span>
                                            </button>
                                        </div>
                                        <div class="acu-template-preset-actions">
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-template-preset-saveas" class="acu-mini-btn" title="Lưu mẫu đang chạy thành preset toàn cục mới">
                                                <i class="fa-solid fa-copy"></i><span>Lưu thành</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-template-preset-rename" class="acu-mini-btn" title="Đổi tên preset toàn cục đang chọn">
                                                <i class="fa-solid fa-i-cursor"></i><span>Đổi tên</span>
                                            </button>
                                            <button id="${SCRIPT_ID_PREFIX_ACU}-template-preset-delete" class="acu-mini-btn danger" title="Xóa preset toàn cục đang chọn">
                                                <i class="fa-solid fa-trash"></i><span>Xóa</span>
                                            </button>
                                        </div>
                                    </div>
                                    <small class="notes">Ở đây chỉ quản lý thư viện preset mẫu toàn cục (nhập / xuất / lưu thành / đổi tên / xóa); khi cần ghi đè lưu mẫu toàn cục, hãy dùng "Lưu vào toàn cục" ở đầu trình chỉnh sửa trực quan.</small>
                                </div>
                                <div style="padding: 16px; background: var(--acu-bg-1); border-radius: 8px; border: 1px solid var(--acu-border); display: flex; flex-direction: column; gap: 12px;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                                        <div>
                                            <div style="font-weight: 600; color: var(--acu-text-1);">Cuộc trò chuyện hiện tại đang dùng</div>
                                            <small id="${SCRIPT_ID_PREFIX_ACU}-template-chat-scope-status" class="notes">Khi chưa lưu cấp cuộc trò chuyện, phần này sẽ theo mẫu toàn cục</small>
                                        </div>
                                        <span style="padding: 2px 8px; border-radius: 999px; background: color-mix(in srgb, var(--acu-success) 14%, transparent); color: var(--acu-success); font-size: 12px; font-weight: 600;">Trò chuyện</span>
                                    </div>
                                    <div class="qrf_settings_block" style="margin-bottom: 0;">
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-select" style="font-weight: 500;">Preset mẫu cuộc trò chuyện hiện tại</label>
                                        <select id="${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-select" class="text_pole" style="width: 100%; margin-top: 5px;">
                                            <option value="${DEFAULT_TEMPLATE_PRESET_OPTION_VALUE_ACU}">Preset mặc định</option>
                                        </select>
                                    </div>
                                    <div class="acu-template-preset-actions">
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-template-chat-import-preset" class="acu-mini-btn" title="Nhập mẫu vào danh sách preset của cuộc trò chuyện hiện tại; preset cùng tên sẽ bị ghi đè">
                                            <i class="fa-solid fa-file-import"></i><span>Nhập vào cuộc trò chuyện hiện tại</span>
                                        </button>
                                        <button id="${SCRIPT_ID_PREFIX_ACU}-template-chat-export-preset" class="acu-mini-btn" title="Xuất preset mẫu cuộc trò chuyện hiện tại đang dùng">
                                            <i class="fa-solid fa-download"></i><span>Xuất cuộc trò chuyện hiện tại</span>
                                        </button>
                                    </div>
                                    <input type="file" id="${SCRIPT_ID_PREFIX_ACU}-template-chat-preset-file-input" style="display: none;" accept=".json">
                                    <small id="${SCRIPT_ID_PREFIX_ACU}-template-chat-origin-status" class="notes">Ở đây chỉ nhập / xuất preset mẫu của cuộc trò chuyện hiện tại; khi cần ghi đè lưu, hãy dùng "Lưu vào cuộc trò chuyện hiện tại" hoặc "Lưu vào toàn cục" trong trình chỉnh sửa trực quan.</small>
                                </div>
                            </div>
                        </div>
                        <!-- 楼层范围选择 -->
                        <div style="background: var(--acu-bg-2); padding: 12px; border-radius: 6px; margin-bottom: 10px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 0.9em; color: var(--acu-text-1); font-weight: 500;">Cài đặt phạm vi xóa</h4>
                            <div class="acu-grid">
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-delete-start-floor" style="font-weight: 500; font-size: 0.85em;">Tầng AI bắt đầu:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-delete-start-floor" min="1" value="1" placeholder="1" style="width: 100%; padding: 4px 8px; border: 1px solid var(--acu-border-2); border-radius: 4px; background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                                </div>
                                <div>
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-delete-end-floor" style="font-weight: 500; font-size: 0.85em;">Tầng AI kết thúc:</label>
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-delete-end-floor" min="1" placeholder="Để trống để xóa đến cuối" style="width: 100%; padding: 4px 8px; border: 1px solid var(--acu-border-2); border-radius: 4px; background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                                </div>
                            </div>
                            <div style="margin-top: 6px; font-size: 0.8em; color: var(--acu-text-3);">
                                Mặc định chọn tất cả tầng AI, có thể đặt phạm vi để xóa chính xác (chỉ tính phản hồi AI). Phạm vi tầng áp dụng cho cả hai nút xóa; "Xóa toàn bộ dữ liệu cục bộ" chỉ xóa sạch hoàn toàn khi phạm vi bao trùm tất cả tầng AI.
                            </div>
                        </div>

                        <div class="button-group acu-data-mgmt-buttons acu-cols-2" style="margin-top: 10px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-delete-current-local-data" class="btn-warning">Xóa dữ liệu cục bộ của mã định danh hiện tại</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-delete-all-local-data" class="btn-danger">Xóa toàn bộ dữ liệu cục bộ (dùng thận trọng)</button>
                        </div>
                        <div class="button-group" style="margin-top: 20px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-open-new-visualizer" class="primary acu-btn-medium" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 10px;">
                                <i class="fa-solid fa-table-columns"></i> Mở trình chỉnh sửa bảng trực quan
                            </button>
                        </div>
                        <p class="notes" style="text-align: center; margin-top: 10px;">Nhấn nút phía trên để mở giao diện trực quan mới, hỗ trợ sửa dữ liệu trực tiếp, đổi tiêu đề cột và cập nhật tham số.</p>
                    </div>
                    
                </div>`;
}