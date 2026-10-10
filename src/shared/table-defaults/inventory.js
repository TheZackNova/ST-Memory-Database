/**
 * 背包物品表 — 默认表定义
 */
export const inventorySheet = {
  uid: "sheet_in05z9vz",
  name: "背包物品表",
  sourceData: {
    note: "Ghi lại tất cả vật phẩm, trang bị mà nhân vật chính sở hữu. (Số cột đánh số từ 0, khớp với chỉ số cột trong dữ liệu bảng)\n- Cột 0: 物品名称 (Tên vật phẩm) - Tên của vật phẩm, không được trùng với vật phẩm đã có trong bảng.\n- Cột 1: 数量 (Số lượng) - Số lượng đang sở hữu.\n- Cột 2: 描述/效果 (Mô tả/Hiệu quả) - Công dụng hoặc mô tả bối cảnh của vật phẩm.\n- Cột 3: 类别 (Loại) - Loại của vật phẩm (ví dụ: \u201Cvũ khí\u201D, \u201Cvật tiêu hao\u201D, \u201Cđồ linh tinh\u201D).",
    initNode: "Khi khởi tạo game, dựa theo cốt truyện và thiết lập để thêm các vật phẩm mang theo ban đầu của nhân vật chính.",
    deleteNode: "Xóa khi vật phẩm bị tiêu hao hết, vứt bỏ hoặc phá hủy.\nVí dụ SQL: DELETE FROM inventory WHERE item_name = 'Vật phẩm đã tiêu hao';\nVí dụ SQL (hàng loạt): DELETE FROM inventory WHERE quantity <= 0;",
    updateNode: "Cập nhật khi nhận thêm vật phẩm đã có khiến số lượng tăng, hoặc khi trạng thái vật phẩm đã có thay đổi.\nVí dụ SQL: UPDATE inventory SET quantity = quantity + 3 WHERE item_name = 'Thuốc hồi phục';\nVí dụ SQL (nhiều cột): UPDATE inventory SET quantity = quantity - 1, description = 'Đã hỏng' WHERE item_name = 'Kiếm sắt';",
    insertNode: "Thêm khi nhân vật chính nhận được vật phẩm hoàn toàn mới chưa có trong túi đồ.\nVí dụ SQL: INSERT INTO inventory (item_name, quantity, description, category) VALUES ('Vật phẩm mới', 1, 'Mô tả vật phẩm', 'Đồ linh tinh');",
    ddl: `CREATE TABLE inventory ( -- 背包物品表
  row_id INTEGER PRIMARY KEY, -- 行号
  item_name TEXT NOT NULL UNIQUE, -- 物品名称
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity > 0), -- 数量
  description TEXT, -- 描述/效果
  category TEXT -- 类别
);`
  },
  content: [
    [
      "row_id",
      "物品名称",
      "数量",
      "描述/效果",
      "类别"
    ]
  ],
  updateConfig: {
    uiSentinel: -1,
    contextDepth: -1,
    updateFrequency: -1,
    batchSize: -1,
    skipFloors: -1
  },
  exportConfig: {
    enabled: false,
    splitByRow: false,
    entryName: "背包物品表",
    entryType: "constant",
    keywords: "",
    preventRecursion: true,
    injectionTemplate: "",
    extraIndexEnabled: false,
    extraIndexEntryName: "背包物品表-索引",
    extraIndexColumns: [],
    extraIndexColumnModes: {},
    extraIndexInjectionTemplate: "",
    entryPlacement: {
      position: "at_depth_as_system",
      depth: 2,
      order: 10000
    },
    extraIndexPlacement: {
      position: "at_depth_as_system",
      depth: 2,
      order: 10010
    },
    fixedEntryPlacement: {
      position: "at_depth_as_system",
      depth: 2,
      order: 99990
    },
    fixedIndexPlacement: {
      position: "at_depth_as_system",
      depth: 2,
      order: 99991
    }
  },
  orderNo: 4
};
