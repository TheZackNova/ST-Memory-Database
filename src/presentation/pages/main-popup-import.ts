// main-popup-import.ts
// Import标签页（外部导入）HTML生成

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

/**
 * 生成 Import 标签页的 HTML 片段
 * 包含：TXT文件导入、世界书注入目标、拆分设置、注入表选择
 */
export function generateImportTabHTML(): string {
    return `
                <div id="acu-tab-import" class="acu-tab-content">
                    <div class="acu-card">
                        <h3>Nhập từ tệp TXT</h3>
                        <p class="notes">Nhập nội dung từ tệp TXT bên ngoài, chia theo số ký tự chỉ định và chèn vào sổ thế giới chỉ định dưới dạng các mục độc lập. Các mục này độc lập với lịch sử trò chuyện và sẽ không bị tự động xóa.</p>
                        
                        <hr style="border-color: var(--acu-border-2); margin: 15px 0;">
                        
                        <div>
                            <label for="${SCRIPT_ID_PREFIX_ACU}-import-worldbook-injection-target">Sổ thế giới đích để chèn dữ liệu nhập:</label>
                            <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-import-worldbook-injection-target-filter" placeholder="Lọc sổ thế giới..." style="width: 100%; margin: 6px 0 8px 0; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--acu-border-2); background: var(--acu-control-bg, var(--acu-bg-1)); color: var(--acu-control-text, var(--acu-text-1));">
                            <div class="input-group">
                                <select id="${SCRIPT_ID_PREFIX_ACU}-import-worldbook-injection-target" style="width: 100%;"></select>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-refresh-import-worldbooks" title="Làm mới danh sách sổ thế giới">Làm mới</button>
                            </div>
                            <small class="notes">Chọn sổ thế giới mà dữ liệu nhập sẽ được chèn vào (độc lập với cài đặt sổ thế giới của cập nhật thông thường). <strong>Lưu ý: không khuyến khích dùng sổ thế giới gắn với thẻ nhân vật, nên dùng sổ thế giới khác tạo mới.</strong></small>
                        </div>
                        <div class="qrf_settings_block" style="margin-top: 12px; margin-bottom: 12px;">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-import-prompt-exclude-imported-worldbook-entries"><strong>Chặn placeholder mục sổ thế giới nhập từ bên ngoài</strong></label>
                            <label class="toggle-switch">
                                <input id="${SCRIPT_ID_PREFIX_ACU}-import-prompt-exclude-imported-worldbook-entries" type="checkbox" />
                                <span class="slider"></span>
                            </label>
                            <small class="notes">Chỉ có hiệu lực với quy trình nhập từ bên ngoài. Khi bật, placeholder mục sổ thế giới trong prompt điền bảng sẽ tự động chặn mọi mục sổ thế giới mang nhãn "外部导入-", tránh quy trình nhập đọc lặp lại các mục đã nhập.</small>
                        </div>
                        
                        <div class="acu-grid" style="grid-template-columns: 1fr 1fr; align-items: end; gap: 20px; margin-bottom: 10px;">
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-import-split-size">Số ký tự mỗi đoạn:</label>
                                <div class="input-group">
                                    <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-import-split-size" min="100" step="100" value="10000">
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-save-import-split-size">Lưu</button>
                                </div>
                            </div>
                            <div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-import-encoding">Mã hóa tệp:</label>
                                <select id="${SCRIPT_ID_PREFIX_ACU}-import-encoding">
                                    <option value="UTF-8">UTF-8 (mặc định)</option>
                                    <option value="GBK" selected>GBK (Hán giản thể)</option>
                                    <option value="Big5">Big5 (Hán phồn thể)</option>
                                </select>
                            </div>
                        </div>
                        
                        <div id="${SCRIPT_ID_PREFIX_ACU}-import-status" class="notes" style="margin-bottom: 15px; font-weight: bold;">Trạng thái: chưa tải tệp.</div>

                        <div class="button-group">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-txt-button" class="primary">1. Chọn và tách tệp TXT</button>
                        </div>
                        <div style="margin: 10px 0 8px 0; font-weight: 700;">Chọn bảng chèn (bảng tự chọn)</div>
                        <div class="notes" style="margin-bottom:6px;">Chọn các bảng cần ghi vào sổ thế giới (chọn nhiều; nếu chưa từng chọn thì mặc định chọn tất cả).</div>
                        <div class="button-group" style="justify-content:flex-start; gap:8px; margin-bottom:6px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-table-select-all" class="button">Chọn tất cả</button>
                            <button id="${SCRIPT_ID_PREFIX_ACU}-import-table-select-none" class="button">Bỏ chọn tất cả</button>
                        </div>
                        <div id="${SCRIPT_ID_PREFIX_ACU}-import-table-selector" style="min-height:60px;">Đang tải danh sách bảng...</div>

                        <div class="button-group" style="margin-top: 10px;">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-inject-imported-txt-button" disabled>2. Chèn (bảng tự chọn)</button>
                        </div>
                        <div class="button-group">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-delete-imported-entries" class="btn-danger">Xóa mục đã chèn</button>
                        </div>
                        <div class="button-group">
                            <button id="${SCRIPT_ID_PREFIX_ACU}-clear-imported-cache-button" class="btn-danger" style="font-weight: bold;">Xóa sạch bộ nhớ đệm tạm của việc nhập</button>
                        </div>
                        <input type="file" id="${SCRIPT_ID_PREFIX_ACU}-hidden-file-input" style="display: none;" accept=".txt">
                    </div>
                </div>`;
}