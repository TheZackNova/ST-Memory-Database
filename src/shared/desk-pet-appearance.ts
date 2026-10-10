/**
 * 桌宠与通知气泡的外观设置：字段定义、类型与缺省值。
 *
 * 存在 settings_ACU.deskPetAppearance / settings_ACU.noticeBubbleAppearance，只存用户改过的项；
 * 桌宠位置沿用 settings_ACU.desktopPetPosition。缺省值与改造前写死在组件里的常量一致。
 */
import { resolveAppearance_ACU, type AppearanceField_ACU, type AppearanceSchema_ACU } from './appearance-schema';

export const DESK_PET_REACTIONS_ACU = ['shy', 'tickle', 'angry', 'happy', 'dizzy', 'surprised', 'wave', 'huff', 'pound', 'knockdown'] as const;
export const DESK_PET_POSES_ACU = [
  'idle', 'blink', 'look-left', 'look-right', 'walk-a', 'walk-b', 'roll', 'eat-a', 'eat-b', 'yawn',
  'snore', 'sit-snore', 'working', 'struggle', ...DESK_PET_REACTIONS_ACU,
] as const;
export const DESK_PET_PEEK_IMAGES_ACU = ['peek', 'peek-original', 'peek-sleepy'] as const;
export const DESK_PET_IMAGE_KEYS_ACU = [...DESK_PET_POSES_ACU, ...DESK_PET_PEEK_IMAGES_ACU] as const;
export const DESK_PET_IDLE_ACTIONS_ACU = ['blink', 'doubleBlink', 'lookAround', 'walk', 'roll', 'eat', 'yawn', 'glance'] as const;
export const DESK_PET_STATUS_GROUPS_ACU = ['table', 'plan', 'polish', 'continuation', 'simulation', 'import', 'index', 'skill', 'generic'] as const;
export const DESK_PET_DOCK_EDGES_ACU = ['left', 'right', 'top', 'bottom'] as const;
export const NOTICE_BUBBLE_SIDES_ACU = ['above', 'below', 'left', 'right'] as const;
export const NOTICE_BUBBLE_DOCK_CORNERS_ACU = ['top-right', 'top-left', 'bottom-right', 'bottom-left'] as const;

export type DeskPetReaction_ACU = typeof DESK_PET_REACTIONS_ACU[number];
export type DeskPetPose_ACU = typeof DESK_PET_POSES_ACU[number];
export type DeskPetPeekImage_ACU = typeof DESK_PET_PEEK_IMAGES_ACU[number];
export type DeskPetImageKey_ACU = typeof DESK_PET_IMAGE_KEYS_ACU[number];
export type DeskPetIdleAction_ACU = typeof DESK_PET_IDLE_ACTIONS_ACU[number];
export type DeskPetStatusGroup_ACU = typeof DESK_PET_STATUS_GROUPS_ACU[number];
export type DeskPetDockEdge_ACU = typeof DESK_PET_DOCK_EDGES_ACU[number];
export type NoticeBubbleSide_ACU = typeof NOTICE_BUBBLE_SIDES_ACU[number];
export type NoticeBubbleDockCorner_ACU = typeof NOTICE_BUBBLE_DOCK_CORNERS_ACU[number];
/** append：追加到内置文案之后；replace：只用自定义文案（自定义为空时仍用内置）。 */
export type AppearanceTextMode_ACU = 'append' | 'replace';

export interface DeskPetAppearance_ACU {
  /** null 表示使用内置图。 */
  images: Record<DeskPetImageKey_ACU, string | null>;
  size: { wide: number; narrow: number; peekDepthRatio: number; peekOriginalDepthRatio: number };
  motion: {
    enabled: boolean;
    idleActionMinMs: number;
    idleActionSpreadMs: number;
    idleActionWeights: Record<DeskPetIdleAction_ACU, number>;
    /** 0 表示不睡。 */
    snoreAfterMs: number;
    /** 0 表示不自动缩进。 */
    tuckDelayMs: number;
    peekRotateMs: number;
    peekOriginalChance: number;
    waveCooldownMs: number;
    reactionMs: Record<DeskPetReaction_ACU, number>;
  };
  jokes: { mode: AppearanceTextMode_ACU; heading: string; items: string[] };
  statusWords: { mode: AppearanceTextMode_ACU; groups: Record<DeskPetStatusGroup_ACU, string[]> };
}

export interface NoticeBubbleAppearance_ACU {
  colors: {
    background: string;
    text: string;
    muted: string;
    border: string;
    info: string;
    success: string;
    warning: string;
    error: string;
    joke: string;
    jokeBackground: string;
    jokeHeading: string;
    danger: string;
    dangerText: string;
  };
  fontSize: number;
  fontFamily: string;
  borderRadius: number;
  size: { minWidth: number; maxWidth: number; dockedMaxWidth: number; detailMaxHeight: number };
  anchor: { gap: number; sides: NoticeBubbleSide_ACU[] };
  dock: { corner: NoticeBubbleDockCorner_ACU; offsetX: number; offsetY: number; narrowOffsetY: number };
  /** slidesPerJoke 为 0 表示不在消息间插播语录；idleJokeMs 为 0 表示空闲时不讲。 */
  carousel: { slideMs: number; slidesPerJoke: number; idleJokeMs: number };
}

/** 桌宠位置按视口可用范围的比例保存（0~1）；edge 为吸附的侧边，null 表示自由停放。 */
export interface DeskPetPosition_ACU {
  x: number;
  y: number;
  edge: DeskPetDockEdge_ACU | null;
}

/** 设置整份随每次保存写盘，图片数据过大会拖慢所有保存。 */
export const DESK_PET_IMAGE_MAX_LENGTH_ACU = 1024 * 1024;
export const DESK_PET_IMAGES_TOTAL_MAX_LENGTH_ACU = 4 * 1024 * 1024;

const IMAGE_LABELS_ACU: Record<DeskPetImageKey_ACU, string> = {
  idle: 'Chờ',
  blink: 'Chớp mắt',
  'look-left': 'Nhìn sang trái',
  'look-right': 'Nhìn sang phải',
  'walk-a': 'Đi dạo (khung 1)',
  'walk-b': 'Đi dạo (khung 2)',
  roll: 'Lăn lộn',
  'eat-a': 'Lén ăn vặt (khung 1)',
  'eat-b': 'Lén ăn vặt (khung 2)',
  yawn: 'Ngáp',
  snore: 'Ngáy',
  'sit-snore': 'Ngồi dưới đất ngáy',
  working: 'Đang làm việc',
  struggle: 'Bị nhấc lên và vùng vẫy',
  shy: 'Ngại ngùng (nhấp một lần)',
  tickle: 'Sợ nhột (nhấp ba lần liên tiếp)',
  angry: 'Tức giận (bị chọc quá nhiều)',
  happy: 'Được vuốt rất dễ chịu (nhấn giữ)',
  dizzy: 'Bị lắc đến chóng mặt',
  surprised: 'Giật mình khi đang ngủ bị đánh thức',
  wave: 'Chào khi chuột lại gần',
  huff: 'Tức đến mức thở phì phò',
  pound: 'Đập màn hình',
  knockdown: 'Tự làm mình ngã',
  peek: 'Thò đầu sát cạnh (cắt phẳng cạnh dưới, đầu hướng lên, tự xoay theo cạnh bám)',
  'peek-original': 'Thò đầu sát cạnh · Tạo hình hiếm',
  'peek-sleepy': 'Thò đầu sát cạnh · Khi đang ngủ',
};

const IDLE_ACTION_DEFAULTS_ACU: Record<DeskPetIdleAction_ACU, [label: string, weight: number]> = {
  blink: ['Chớp mắt', 16],
  doubleBlink: ['Chớp mắt hai lần liên tiếp', 8],
  lookAround: ['Nhìn quanh trái phải', 14],
  walk: ['Đi dạo', 18],
  roll: ['Lăn lộn', 10],
  eat: ['Lén ăn vặt', 14],
  yawn: ['Ngáp', 10],
  glance: ['Liếc sang một bên', 10],
};

const REACTION_DEFAULTS_ACU: Record<DeskPetReaction_ACU, [label: string, ms: number]> = {
  shy: ['Ngại ngùng', 1600],
  tickle: ['Sợ nhột', 1600],
  angry: ['Tức giận', 2200],
  happy: ['Được vuốt dễ chịu (dư âm sau khi thả tay tính riêng)', 1100],
  dizzy: ['Chóng mặt', 2400],
  surprised: ['Giật mình', 1300],
  wave: ['Chào hỏi', 1600],
  huff: ['Thở phì phò', 1000],
  pound: ['Đập màn hình', 1300],
  knockdown: ['Ngã xuống', 2200],
};

const STATUS_GROUP_LABELS_ACU: Record<DeskPetStatusGroup_ACU, string> = {
  table: 'Điền bảng / Bắt kịp',
  plan: 'Lập kế hoạch cốt truyện',
  polish: 'Tối ưu chính văn',
  continuation: 'Viết tiếp thông minh',
  simulation: 'Mô phỏng thế giới',
  import: 'Nhập từ bên ngoài',
  index: 'Giao hỏa / Chỉ mục / Truy hồi',
  skill: 'Chỉnh lý Skill',
  generic: 'Tác vụ khác',
};

const DEFAULT_FONT_FAMILY_ACU = '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
const FONT_FAMILY_RE_ACU = /^[\p{L}\p{N}\s,'"._-]+$/u;

function fieldsFrom_ACU<K extends string>(keys: readonly K[], make: (key: K) => AppearanceField_ACU): AppearanceSchema_ACU {
  return Object.fromEntries(keys.map(key => [key, make(key)]));
}

const integer_ACU = (label: string, value: number, min: number, max: number, zeroAllowed = false): AppearanceField_ACU =>
  ({ kind: 'number', label, default: value, min, max, integer: true, ...(zeroAllowed ? { zeroAllowed: true } : {}) });

const ratio_ACU = (label: string, value: number, min: number, max: number): AppearanceField_ACU =>
  ({ kind: 'number', label, default: value, min, max });

const color_ACU = (label: string, value: string): AppearanceField_ACU => ({ kind: 'color', label, default: value });

const textMode_ACU = (label: string): AppearanceField_ACU =>
  ({ kind: 'enum', label, default: 'append', values: ['append', 'replace'] });

export const DESK_PET_APPEARANCE_SCHEMA_ACU: AppearanceSchema_ACU = {
  images: {
    kind: 'group',
    label: 'Hình ảnh hành động: liên kết http(s), đường dẫn nội bộ hoặc data:image, null là hình có sẵn',
    fields: fieldsFrom_ACU(DESK_PET_IMAGE_KEYS_ACU, key => ({ kind: 'image', label: IMAGE_LABELS_ACU[key], maxLength: DESK_PET_IMAGE_MAX_LENGTH_ACU })),
  },
  size: {
    kind: 'group',
    label: 'Kích thước',
    fields: {
      wide: integer_ACU('Kích thước màn hình rộng (px)', 88, 32, 256),
      narrow: integer_ACU('Kích thước màn hình hẹp (px, độ rộng khung nhìn ≤640px)', 64, 32, 256),
      peekDepthRatio: ratio_ACU('Tỷ lệ phần lộ ra so với kích thước khi thụt vào sát cạnh', 0.56, 0.2, 1),
      peekOriginalDepthRatio: ratio_ACU('Tỷ lệ phần lộ ra so với kích thước của tạo hình thò đầu hiếm', 0.61, 0.2, 1),
    },
  },
  motion: {
    kind: 'group',
    label: 'Hoạt ảnh và nhịp điệu',
    fields: {
      enabled: { kind: 'boolean', label: 'Công tắc hiệu ứng: khi tắt sẽ không phát hiệu ứng thở, lắc lư, cũng không đi dạo lăn lộn (khung hành động vẫn chuyển bình thường)', default: true },
      idleActionMinMs: integer_ACU('Khoảng cách tối thiểu giữa các cử động nhỏ khi chờ (mili giây)', 15000, 1000, 3600000),
      idleActionSpreadMs: integer_ACU('Độ dao động ngẫu nhiên của khoảng cách cử động nhỏ khi chờ (mili giây)', 5000, 0, 3600000),
      idleActionWeights: {
        kind: 'group',
        label: 'Trọng số chọn cử động nhỏ khi chờ (0 nghĩa là không làm)',
        fields: fieldsFrom_ACU(DESK_PET_IDLE_ACTIONS_ACU, key => ratio_ACU(IDLE_ACTION_DEFAULTS_ACU[key][0], IDLE_ACTION_DEFAULTS_ACU[key][1], 0, 1000)),
      },
      snoreAfterMs: integer_ACU('Không tương tác sau bao lâu thì ngủ (mili giây, 0 nghĩa là không ngủ)', 60000, 5000, 86400000, true),
      tuckDelayMs: integer_ACU('Sau khi bám vào cạnh màn hình bao lâu thì thụt vào (mili giây, 0 nghĩa là không tự thụt)', 4000, 500, 3600000, true),
      peekRotateMs: integer_ACU('Khoảng cách chọn lại tạo hình thò đầu trong lúc thụt vào (mili giây)', 30000, 1000, 3600000),
      peekOriginalChance: ratio_ACU('Xác suất chọn được tạo hình thò đầu hiếm khi thụt vào', 0.01, 0, 1),
      waveCooldownMs: integer_ACU('Thời gian hồi chiêu chào khi chuột lại gần (mili giây)', 30000, 0, 86400000),
      reactionMs: {
        kind: 'group',
        label: 'Thời lượng phản ứng tương tác (mili giây)',
        fields: fieldsFrom_ACU(DESK_PET_REACTIONS_ACU, key => integer_ACU(REACTION_DEFAULTS_ACU[key][0], REACTION_DEFAULTS_ACU[key][1], 200, 20000)),
      },
    },
  },
  jokes: {
    kind: 'group',
    label: 'Câu nói (chuyện cười lạnh chèn vào bong bóng)',
    fields: {
      mode: textMode_ACU('append: thêm vào sau câu nói có sẵn; replace: chỉ dùng câu nói tùy chỉnh (nếu tùy chỉnh rỗng vẫn dùng loại có sẵn)'),
      heading: { kind: 'text', label: 'Tiêu đề bong bóng câu nói (có thể để trống)', default: 'Bạn có biết?', maxLength: 40, allowEmpty: true },
      items: { kind: 'textList', label: 'Câu nói tùy chỉnh', maxItems: 2000, maxLength: 600 },
    },
  },
  statusWords: {
    kind: 'group',
    label: 'Từ trạng thái bận (bong bóng hiển thị “Đang XX…”)',
    fields: {
      mode: textMode_ACU('append: thêm vào sau từ trạng thái có sẵn; replace: chỉ dùng từ trạng thái tùy chỉnh (nếu một nhóm rỗng thì nhóm đó vẫn dùng loại có sẵn)'),
      groups: {
        kind: 'group',
        label: 'Từ trạng thái tùy chỉnh theo nhóm chức năng',
        fields: fieldsFrom_ACU(DESK_PET_STATUS_GROUPS_ACU, key => ({ kind: 'textList', label: STATUS_GROUP_LABELS_ACU[key], maxItems: 200, maxLength: 20 })),
      },
    },
  },
};

export const NOTICE_BUBBLE_APPEARANCE_SCHEMA_ACU: AppearanceSchema_ACU = {
  colors: {
    kind: 'group',
    label: 'Phối màu',
    fields: {
      background: color_ACU('Màu nền', '#fffaf0'),
      text: color_ACU('Chữ chính văn', '#3d3122'),
      muted: color_ACU('Chữ phụ (tiêu đề chi tiết, nút đóng)', '#7a6a52'),
      border: color_ACU('Viền và đường phân cách', '#e9cf8a'),
      info: color_ACU('Màu nhấn của thông báo thường (tiêu đề, viền nút)', '#d4a93a'),
      success: color_ACU('Màu nhấn của thông báo thành công', '#6f9a4d'),
      warning: color_ACU('Màu nhấn của thông báo cảnh báo', '#d08a2c'),
      error: color_ACU('Màu nhấn của thông báo lỗi', '#c2503a'),
      joke: color_ACU('Màu nhấn của câu nói', '#e6b93c'),
      jokeBackground: color_ACU('Màu nền của câu nói', '#fff6d8'),
      jokeHeading: color_ACU('Chữ tiêu đề câu nói', '#a47a12'),
      danger: color_ACU('Viền và màu nền khi rê chuột của nút nguy hiểm (như “Dừng”)', '#c2503a'),
      dangerText: color_ACU('Chữ của nút nguy hiểm', '#a33d29'),
    },
  },
  fontSize: integer_ACU('Cỡ chữ chính văn (px), tiêu đề và nút thay đổi theo', 12, 10, 24),
  fontFamily: {
    kind: 'text',
    label: 'Phông chữ (CSS font-family)',
    default: DEFAULT_FONT_FAMILY_ACU,
    maxLength: 300,
    pattern: FONT_FAMILY_RE_ACU,
    patternHint: 'Chỉ được chứa chữ cái, chữ số, dấu cách, dấu phẩy, dấu nháy, dấu chấm, dấu gạch dưới và dấu gạch nối',
  },
  borderRadius: integer_ACU('Bo góc (px)', 12, 0, 32),
  size: {
    kind: 'group',
    label: 'Kích thước',
    fields: {
      minWidth: integer_ACU('Chiều rộng tối thiểu (px)', 200, 80, 600),
      maxWidth: integer_ACU('Chiều rộng tối đa khi bám sát thú cưng màn hình (px)', 400, 120, 960),
      dockedMaxWidth: integer_ACU('Chiều rộng tối đa khi không có thú cưng màn hình và bám góc màn hình (px)', 360, 120, 960),
      detailMaxHeight: integer_ACU('Chiều cao tối đa của vùng chi tiết khi mở rộng (px)', 160, 40, 800),
    },
  },
  anchor: {
    kind: 'group',
    label: 'Cách bố trí khi bám sát thú cưng màn hình',
    fields: {
      gap: integer_ACU('Khoảng cách với thú cưng màn hình (px)', 12, 0, 96),
      sides: {
        kind: 'enumList',
        label: 'Thứ tự ưu tiên của các hướng bố trí, nếu không vừa thì thử lần lượt; nếu đều không vừa thì dùng hướng cuối và kẹp vào trong màn hình',
        default: ['above', 'below', 'left', 'right'],
        values: NOTICE_BUBBLE_SIDES_ACU,
        minItems: 1,
      },
    },
  },
  dock: {
    kind: 'group',
    label: 'Vị trí bám khi không có thú cưng màn hình',
    fields: {
      corner: { kind: 'enum', label: 'Góc màn hình để bám', default: 'top-right', values: NOTICE_BUBBLE_DOCK_CORNERS_ACU },
      offsetX: integer_ACU('Cách mép trái/phải (px)', 18, 0, 400),
      offsetY: integer_ACU('Cách mép trên/dưới (px)', 62, 0, 400),
      narrowOffsetY: integer_ACU('Màn hình hẹp (độ rộng khung nhìn ≤640px) cách mép trên/dưới (px), ở màn hình hẹp căn giữa ngang', 58, 0, 400),
    },
  },
  carousel: {
    kind: 'group',
    label: 'Nhịp luân phiên',
    fields: {
      slideMs: integer_ACU('Thời gian dừng của mỗi tin (mili giây)', 5000, 1000, 120000),
      slidesPerJoke: integer_ACU('Cứ phát bao nhiêu tin thì chèn một câu nói (0 nghĩa là không chèn)', 2, 1, 50, true),
      idleJokeMs: integer_ACU('Rảnh bao lâu thì nói một câu (mili giây, 0 nghĩa là khi rảnh không nói)', 300000, 10000, 86400000, true),
    },
  },
};

export function defaultDeskPetAppearance_ACU(): DeskPetAppearance_ACU {
  return resolveAppearance_ACU(DESK_PET_APPEARANCE_SCHEMA_ACU, {}) as unknown as DeskPetAppearance_ACU;
}

export function defaultNoticeBubbleAppearance_ACU(): NoticeBubbleAppearance_ACU {
  return resolveAppearance_ACU(NOTICE_BUBBLE_APPEARANCE_SCHEMA_ACU, {}) as unknown as NoticeBubbleAppearance_ACU;
}

/** 写入前的跨字段检查：自定义图片总量。 */
export function checkDeskPetAppearance_ACU(appearance: DeskPetAppearance_ACU): void {
  const total = Object.values(appearance.images).reduce((sum, src) => sum + (src ? src.length : 0), 0);
  if (total > DESK_PET_IMAGES_TOTAL_MAX_LENGTH_ACU) {
    throw new RangeError(`deskPet.images: tổng ảnh tùy chỉnh là ${total} ký tự, vượt quá giới hạn ${DESK_PET_IMAGES_TOTAL_MAX_LENGTH_ACU}; ảnh lớn hãy dùng liên kết ảnh`);
  }
}

/** 写入前的跨字段检查：最小宽度不能超过两种最大宽度。 */
export function checkNoticeBubbleAppearance_ACU(appearance: NoticeBubbleAppearance_ACU): void {
  const { minWidth, maxWidth, dockedMaxWidth } = appearance.size;
  if (minWidth > maxWidth || minWidth > dockedMaxWidth) {
    throw new RangeError(`noticeBubble.size: minWidth (${minWidth}) không được lớn hơn maxWidth (${maxWidth}) hoặc dockedMaxWidth (${dockedMaxWidth})`);
  }
}

export function normalizeDeskPetDockEdge_ACU(value: unknown): DeskPetDockEdge_ACU | null {
  return (DESK_PET_DOCK_EDGES_ACU as readonly unknown[]).includes(value) ? value as DeskPetDockEdge_ACU : null;
}
