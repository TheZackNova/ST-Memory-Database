// main-popup-api.ts
// API标签页（API & 连接）HTML生成

import { SCRIPT_ID_PREFIX_ACU } from '../../shared/constants';

/**
 * 生成 API 标签页的 HTML 片段
 */
export function generateApiTabHTML(): string {
    return `
                <div id="acu-tab-api" class="acu-tab-content">
                     <div class="acu-card">
                        <h3>Cài đặt API</h3>
                        <div class="qrf_settings_block_radio">
                            <label>Chế độ API:</label>
                            <div class="qrf_radio_group">
                                <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-api-mode-custom" name="${SCRIPT_ID_PREFIX_ACU}-api-mode" value="custom" checked>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-mode-custom">API tùy chỉnh</label>
                                <input type="radio" id="${SCRIPT_ID_PREFIX_ACU}-api-mode-tavern" name="${SCRIPT_ID_PREFIX_ACU}-api-mode" value="tavern">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-mode-tavern">Dùng preset kết nối của SillyTavern</label>
                            </div>
                        </div>

                        <div id="${SCRIPT_ID_PREFIX_ACU}-tavern-api-profile-block" style="display: none; margin-top: 12px;">
                            <label for="${SCRIPT_ID_PREFIX_ACU}-tavern-api-profile-select">Preset kết nối SillyTavern:</label>
                             <div class="input-group">
                                <select id="${SCRIPT_ID_PREFIX_ACU}-tavern-api-profile-select"></select>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-refresh-tavern-api-profiles" title="Làm mới danh sách preset">Làm mới</button>
                            </div>
                            <small class="notes">Chọn một preset kết nối bạn đã cấu hình trong cài đặt chính của SillyTavern.</small>
                        </div>

                        <div id="${SCRIPT_ID_PREFIX_ACU}-custom-api-settings-block" style="margin-top: 12px;">
                             <div class="checkbox-group">
                                <input type="checkbox" id="${SCRIPT_ID_PREFIX_ACU}-use-main-api-checkbox">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-use-main-api-checkbox">Dùng API chính (dùng trực tiếp API và mô hình hiện tại của SillyTavern)</label>
                            </div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-custom-api-fields">
                                <p class="notes" style="color: var(--acu-warning);"><b>Lưu ý bảo mật:</b> Khóa API sẽ được lưu trong bộ nhớ cục bộ của trình duyệt.</p>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-url">URL cơ sở API:</label>
                                <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-api-url">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-key">Khóa API (tùy chọn):</label>
                                <input type="password" id="${SCRIPT_ID_PREFIX_ACU}-api-key">
                                <div class="acu-grid" style="margin-top: 10px;">
                                    <div>
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-max-tokens">Tokens tối đa:</label>
                                        <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-max-tokens" min="1" step="1" placeholder="120000">
                                    </div>
                                    <div>
                                        <label for="${SCRIPT_ID_PREFIX_ACU}-temperature">Nhiệt độ:</label>
                                        <input type="number" id="${SCRIPT_ID_PREFIX_ACU}-temperature" min="0" max="2" step="0.05" placeholder="0.9">
                                    </div>
                                </div>
                                <div class="button-group" style="margin-top: 10px;">
                                    <button id="${SCRIPT_ID_PREFIX_ACU}-load-models">Tải danh sách mô hình</button>
                                </div>
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-model-input" style="margin-top: 10px;">Tên mô hình (nhập thủ công):</label>
                                <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-api-model-input" class="text_pole" placeholder="Nhập tên mô hình hoặc chọn từ bên dưới">
                                <label for="${SCRIPT_ID_PREFIX_ACU}-api-model-select" style="margin-top: 8px;">Hoặc chọn từ danh sách:</label>
                                <select id="${SCRIPT_ID_PREFIX_ACU}-api-model-select" class="text_pole">
                                    <option value="">-- Hãy tải danh sách mô hình trước --</option>
                                </select>
                                <div style="margin-top: 12px;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-api-body-params">Tham số Body bổ sung (JSON):</label>
                                    <textarea id="${SCRIPT_ID_PREFIX_ACU}-api-body-params" rows="3" placeholder='{"top_p": 0.9, "frequency_penalty": 0.5}' style="width: 100%; resize: vertical; font-family: monospace;"></textarea>
                                    <small class="notes">Định dạng JSON, sẽ gộp vào body yêu cầu (ghi đè trường cùng tên). Để trống thì không thêm.</small>
                                </div>
                                <div style="margin-top: 8px;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-api-exclude-body-params">Loại trừ tham số Body:</label>
                                    <textarea id="${SCRIPT_ID_PREFIX_ACU}-api-exclude-body-params" rows="2" placeholder='["stream", "top_p"]' style="width: 100%; resize: vertical; font-family: monospace;"></textarea>
                                    <small class="notes">Định dạng mảng JSON, các trường liệt kê sẽ bị gỡ khỏi body yêu cầu. Để trống thì không loại trừ.</small>
                                </div>
                                <div style="margin-top: 8px;">
                                    <label for="${SCRIPT_ID_PREFIX_ACU}-api-request-headers">Header yêu cầu bổ sung (JSON):</label>
                                    <textarea id="${SCRIPT_ID_PREFIX_ACU}-api-request-headers" rows="2" placeholder='{"X-Custom-Header": "value"}' style="width: 100%; resize: vertical; font-family: monospace;"></textarea>
                                    <small class="notes">Định dạng JSON, sẽ gộp vào headers yêu cầu. Để trống thì không thêm.</small>
                                </div>
                            </div>
                            <div id="${SCRIPT_ID_PREFIX_ACU}-api-status" class="notes" style="margin-top:12px;">Trạng thái: chưa cấu hình</div>
                            <div class="button-group">
                                <button id="${SCRIPT_ID_PREFIX_ACU}-save-config" class="primary">Lưu API</button>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-clear-config">Xóa API</button>
                            </div>
                            
                            <!-- API预设管理 -->
                            <div class="acu-divider-dashed" style="margin: 16px 0 12px 0;"></div>
                            <label class="acu-label">Quản lý preset API</label>
                            <div class="acu-row" style="margin-bottom: 8px;">
                                <input type="text" id="${SCRIPT_ID_PREFIX_ACU}-api-preset-name" placeholder="Tên preset" style="flex: 1;">
                                <button id="${SCRIPT_ID_PREFIX_ACU}-save-api-preset" class="primary">Lưu thành preset</button>
                            </div>
                            <div class="acu-row">
                                <select id="${SCRIPT_ID_PREFIX_ACU}-api-preset-select" style="flex: 1;">
                                    <option value="">-- Chọn preset --</option>
                                </select>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-load-api-preset">Tải</button>
                                <button id="${SCRIPT_ID_PREFIX_ACU}-delete-api-preset" style="background: var(--acu-danger); color: white; border-color: var(--acu-danger);">Xóa</button>
                            </div>
                            <small class="notes">Lưu cấu hình API hiện tại thành preset, có thể chọn riêng cho điền bảng và đẩy cốt truyện.</small>
                        </div>
                     </div>
                 </div>`;
}
