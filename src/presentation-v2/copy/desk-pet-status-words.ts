/**
 * 桌宠任务气泡的状态词：似是而非的短词，气泡显示为「正在XXXX…」，不带进度明细。
 * 按功能分组；未识别的功能落到 generic。
 */
import type { AppearanceTextMode_ACU, DeskPetStatusGroup_ACU } from "../../shared/desk-pet-appearance";

export const deskPetStatusWords = {
  table: ["lật sổ sách", "đối chiếu bảng", "chép sổ tay", "đếm ô", "kẻ viền", "chép lại", "đối soát", "bù chỗ sót", "xếp hàng cột", "đóng dấu"],
  plan: ["bấm đốt ngón tay", "bày sa bàn", "ngắm sao", "suy diễn", "nghiền ngẫm", "vẽ lộ trình", "tung xúc xắc", "bài binh bố trận"],
  polish: ["đánh bóng", "vuốt câu", "gọt góc cạnh", "trau chuốt", "bắt lỗi chính tả", "mài từ ngữ", "chỉnh giọng văn", "đánh sáp"],
  continuation: ["nặn ý tưởng", "nháp trong bụng", "cắn đầu bút", "nín chiêu lớn", "khai thừa chuyển hợp", "tiếp mực", "nghĩ đoạn sau", "gài phục bút"],
  simulation: ["đẩy sa bàn", "tính nhân quả", "vặn đồng hồ", "ngó thiên hạ", "lắc ống xăm", "kéo đầu chỉ", "xem cờ", "xếp duyên số"],
  import: ["nhai trang sách", "cắt khối", "lật trang", "gặm mục lục", "bóc kiện hàng", "nuốt chữ", "chia gói", "xếp gáy sách"],
  index: ["lục sổ cũ", "tìm đầu mối", "đối mật khẩu", "đánh hơi manh mối", "sắp hồ sơ", "xâu chuỗi hạt", "tra hồ sơ gốc", "quét giá sách"],
  skill: ["dán nhãn", "lưu trữ", "phân loại", "viết hướng dẫn", "đóng hộp", "đánh số", "dọn ngăn kéo", "làm thẻ"],
  generic: ["tất bật", "vận công", "lẩm bẩm", "bốc gạch", "cắm đầu làm", "quay vòng vòng", "bốc khói", "ùng ục"],
} as const satisfies Record<DeskPetStatusGroup_ACU, readonly string[]>;

export type DeskPetStatusGroup = keyof typeof deskPetStatusWords;
export type DeskPetStatusWords = Readonly<Record<DeskPetStatusGroup, readonly string[]>>;

const FEATURE_GROUP_RULES: Array<[RegExp, DeskPetStatusGroup]> = [
  [/填表|追平|表格|điền bảng|bắt kịp|bảng/i, "table"],
  [/规划|kế hoạch|lập kế hoạch/i, "plan"],
  [/优化|tối ưu/i, "polish"],
  [/续写|viết tiếp/i, "continuation"],
  [/推演|suy diễn|mô phỏng/i, "simulation"],
  [/导入|nhập/i, "import"],
  [/交火|索引|召回|giao hỏa|chỉ mục|truy hồi/i, "index"],
  [/skill/i, "skill"],
];

export function resolveDeskPetStatusGroup(feature: string): DeskPetStatusGroup {
  const text = String(feature || "");
  for (const [pattern, group] of FEATURE_GROUP_RULES) {
    if (pattern.test(text)) return group;
  }
  return "generic";
}

/** 按外观设置合成各组状态词：append 追加到内置之后，replace 只用自定义（某组为空时该组仍用内置）。 */
export function resolveDeskPetStatusWords(custom?: {
  mode: AppearanceTextMode_ACU;
  groups: Readonly<Record<DeskPetStatusGroup, readonly string[]>>;
}): DeskPetStatusWords {
  if (!custom) return deskPetStatusWords;
  const merged = {} as Record<DeskPetStatusGroup, readonly string[]>;
  for (const group of Object.keys(deskPetStatusWords) as DeskPetStatusGroup[]) {
    const extra = custom.groups[group] ?? [];
    if (!extra.length) merged[group] = deskPetStatusWords[group];
    else merged[group] = custom.mode === "replace" ? extra : [...deskPetStatusWords[group], ...extra];
  }
  return merged;
}

/** 为某个功能随机挑一个状态词。 */
export function pickDeskPetStatusWord(
  feature: string,
  random: () => number = Math.random,
  words: DeskPetStatusWords = deskPetStatusWords,
): string {
  const list = words[resolveDeskPetStatusGroup(feature)];
  return list[Math.floor(random() * list.length) % list.length];
}
