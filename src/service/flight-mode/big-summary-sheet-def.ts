import type { Sheet_ACU, SheetExportConfig_ACU, SheetUpdateConfig_ACU } from '../../shared/models/table-data';
import {
  FLIGHT_MODE_BIG_SUMMARY_SHEET_KEY_ACU,
  FLIGHT_MODE_BIG_SUMMARY_SHEET_NAME_ACU,
} from '../../shared/models/flight-mode-model';
import { RECENT_CHRONICLE_ROWS_PLACEHOLDER_ACU as N_ACU } from '../fill-mode/fill-mode-preferences';

const FLIGHT_MODE_BIG_SUMMARY_ENTRY_PLACEMENT_ACU = {
  position: 'at_depth_as_system',
  depth: 1000,
  order: 10010,
};

function cloneValue_ACU<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nextOrderNo_ACU(template: Record<string, any>): number {
  const orderNumbers = Object.keys(template)
    .filter(key => key.startsWith('sheet_'))
    .map(key => Number(template[key]?.orderNo))
    .filter(Number.isFinite);
  return orderNumbers.length > 0 ? Math.max(...orderNumbers) + 1 : 0;
}

export function buildFlightModeBigSummarySheet_ACU(
  chronicleSheet: Sheet_ACU,
  template: Record<string, any>,
): Sheet_ACU {
  const updateConfig = cloneValue_ACU<SheetUpdateConfig_ACU>(chronicleSheet.updateConfig);
  const exportConfig: SheetExportConfig_ACU = {
    enabled: true,
    splitByRow: false,
    entryName: FLIGHT_MODE_BIG_SUMMARY_SHEET_NAME_ACU,
    entryType: 'constant',
    keywords: '',
    preventRecursion: true,
    injectionTemplate: '<大总结>\n$1\n</大总结>',
    extraIndexEnabled: false,
    extraIndexEntryName: `${FLIGHT_MODE_BIG_SUMMARY_SHEET_NAME_ACU}-索引`,
    extraIndexColumns: [],
    extraIndexColumnModes: {},
    extraIndexInjectionTemplate: '',
    entryPlacement: { ...FLIGHT_MODE_BIG_SUMMARY_ENTRY_PLACEMENT_ACU },
    extraIndexPlacement: { ...FLIGHT_MODE_BIG_SUMMARY_ENTRY_PLACEMENT_ACU },
    fixedEntryPlacement: { ...FLIGHT_MODE_BIG_SUMMARY_ENTRY_PLACEMENT_ACU },
    fixedIndexPlacement: { ...FLIGHT_MODE_BIG_SUMMARY_ENTRY_PLACEMENT_ACU },
  };

  return {
    uid: FLIGHT_MODE_BIG_SUMMARY_SHEET_KEY_ACU,
    name: FLIGHT_MODE_BIG_SUMMARY_SHEET_NAME_ACU,
    sourceData: {
      note: `Tóm tắt lớn là bản ghi lịch sử bất biến được thêm theo giai đoạn: mỗi hàng tóm tắt tương ứng với một giai đoạn kỷ yếu đã hoàn tất, các hàng đã có chỉ được đọc để tiếp nối ngữ cảnh, cấm sửa hoặc xóa. Chỉ khi kỷ yếu còn hiển thị hiện tại đạt ${N_ACU} mục (bao gồm vượt quá) mới được thêm một hàng tóm tắt lớn; ít hơn ${N_ACU} mục thì cấm thêm. Hàng mới phải tóm tắt đầy đủ toàn bộ kỷ yếu đang hiển thị trong bảng kỷ yếu hiện tại, không được chỉ tóm tắt vài mục mới nhất, không được chỉ trích điểm chính, không được bỏ sót các sự kiện làm thay đổi mạch tổng thể; phải mạch lạc về trình tự thời gian, nhân quả, trạng thái nhân vật và diễn tiến giai đoạn với các tóm tắt lớn đã có trước đó, không được mâu thuẫn hoặc làm đứt gãy tường thuật so với các tóm tắt hiện có. Sau khi thêm, hệ thống sẽ ẩn các kỷ yếu đã được tóm tắt tại thời điểm đó. Không cần điền phạm vi tham chiếu kỷ yếu.`,
      initNode: `Không cần khởi tạo; khi kỷ yếu đang hiển thị chưa đạt ${N_ACU} mục, không được lấy lý do khởi tạo để chèn hàng đầu tiên.`,
      deleteNode: 'Cấm xóa bất kỳ tóm tắt lớn nào đã có.',
      updateNode: 'Cấm sửa bất kỳ tóm tắt lớn nào đã có; tóm tắt lớn đã có là bản ghi giai đoạn lịch sử bất biến.',
      insertNode: `Chỉ khi kỷ yếu đang hiển thị đạt ${N_ACU} mục (bao gồm vượt quá), mới thêm một hàng tóm tắt đầy đủ dựa trên toàn bộ nội dung đang hiển thị của bảng kỷ yếu hiện tại, và đảm bảo mạch lạc logic với các tóm tắt lớn trước đó; ít hơn ${N_ACU} mục thì cấm thêm. Không cần ghi phạm vi tham chiếu kỷ yếu.`,
      ddl: `CREATE TABLE flight_big_summary ( -- ${FLIGHT_MODE_BIG_SUMMARY_SHEET_NAME_ACU}\n  row_id INTEGER PRIMARY KEY, -- 行号\n  summary_text TEXT NOT NULL -- 总结\n);`,
    },
    content: [['row_id', '总结']],
    updateConfig,
    exportConfig,
    orderNo: nextOrderNo_ACU(template),
  };
}
