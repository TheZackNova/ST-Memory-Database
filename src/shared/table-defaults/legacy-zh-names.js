/**
 * legacy-zh-names.js — Tên tiếng Trung cũ của bảng mẫu mặc định
 *
 * Bảng mẫu mặc định từng dùng tên bảng/tên cột tiếng Trung. Dữ liệu chat và mẫu đã lưu của người dùng cũ
 * vẫn mang các tên đó, nên mỗi bảng mặc định khai báo tên cũ làm bí danh (tableAliases / columnAliases)
 * để bộ đối chiếu mẫu nhận ra cùng một bảng, cùng một cột và kế thừa dữ liệu thay vì coi là bảng mới.
 *
 * Khóa là tên bảng tiếng Việt hiện tại; headers xếp đúng thứ tự cột của bảng đó (cột đầu luôn là row_id).
 */

/** Tám bảng mặc định gốc. */
export const legacyZhOriginalSheets = {
  'Bảng dữ liệu toàn cục': {
    name: '全局数据表',
    headers: ['row_id', '主角当前所在地点', '当前时间', '上轮场景时间', '经过的时间'],
  },
  'Bảng thông tin nhân vật chính': {
    name: '主角信息表',
    headers: ['row_id', '人物名称', '性别/年龄', '外貌特征', '职业/身份', '过往经历', '性格特点'],
  },
  'Bảng nhân vật quan trọng': {
    name: '重要角色表',
    headers: ['row_id', '姓名', '性别/年龄', '一句话介绍', '外貌特征', '持有的重要物品', '是否离场', '过往经历'],
  },
  'Bảng kỹ năng nhân vật chính': {
    name: '主角技能表',
    headers: ['row_id', '技能名称', '技能类型', '等级/阶段', '效果描述'],
  },
  'Bảng vật phẩm hành trang': {
    name: '背包物品表',
    headers: ['row_id', '物品名称', '数量', '描述/效果', '类别'],
  },
  'Bảng nhiệm vụ và sự kiện': {
    name: '任务与事件表',
    headers: ['row_id', '任务名称', '任务类型', '发布者', '详细描述', '当前进度', '任务时限', '奖励', '惩罚'],
  },
  'Bảng kỷ yếu': {
    name: '纪要表',
    headers: ['row_id', '时间跨度', '地点', '纪要', '概览', '编码索引'],
  },
  'Bảng lựa chọn': {
    name: '选项表',
    headers: ['row_id', '选项一', '选项二', '选项三', '选项四'],
  },
};

/** Các bảng bị bản đặc hóa tình cảm ghi đè trong mẫu mặc định hiện tại; bảng không liệt kê dùng định nghĩa gốc. */
export const legacyZhRomanceSheets = {
  ...legacyZhOriginalSheets,
  'Bảng dữ liệu toàn cục': {
    name: '全局数据表',
    headers: ['row_id', '全局状态', '当前详细地点', '当前次要地区', '当前主要地区', '上轮场景时间', '经过的时间', '当前时间'],
  },
  'Bảng thông tin nhân vật chính': {
    name: '主角信息表',
    headers: ['row_id', '姓名', '性别', '年龄', '外貌特征', '身份', '近况', '所在地点', '随身财物'],
  },
  'Bảng nhân vật quan trọng': {
    name: '重要角色表',
    headers: ['row_id', '姓名', '性别', '年龄', '一句话介绍', '外貌特征', '穿着打扮', '所在地点', '在场状态', '人际关系', '过往经历', '交互选项'],
  },
  'Bảng kỷ yếu': {
    name: '纪要表',
    headers: ['row_id', '编码索引', '时间跨度', '概览', '纪要', '重要对话'],
  },
};
