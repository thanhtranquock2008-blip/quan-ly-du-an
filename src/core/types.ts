// Mô hình dữ liệu dùng chung cho toàn bộ chương trình.
// Thời gian lưu dạng chuỗi ISO cục bộ "YYYY-MM-DDTHH:mm" (không múi giờ),
// thời lượng lưu bằng ngày làm việc (số thực, 0.5 = nửa ngày).

export type LinkType = 'FS' | 'SS' | 'FF' | 'SF'

export type ProjectStatus = 'chuan_bi' | 'thuc_hien' | 'tam_dung' | 'ket_thuc'

export type ConstraintType =
  | 'ASAP' // càng sớm càng tốt (mặc định)
  | 'SNET' // bắt đầu không sớm hơn
  | 'FNET' // kết thúc không sớm hơn
  | 'MSO' // phải bắt đầu đúng ngày

export type ResourceType = 'work' | 'material' | 'cost'

export interface WorkInterval {
  from: string // "07:30"
  to: string // "11:30"
}

export interface Holiday {
  date: string // "YYYY-MM-DD"
  name: string
}

export interface WorkCalendar {
  /** Ngày làm việc trong tuần, 0 = Chủ nhật ... 6 = Thứ bảy */
  workingWeekdays: number[]
  /** Ca làm việc trong một ngày */
  intervals: WorkInterval[]
  holidays: Holiday[]
  /** Ngày làm việc bù (vd: thứ bảy đi làm bù), làm việc dù không thuộc workingWeekdays */
  extraWorkingDays?: string[]
}

export interface Project {
  id: string
  code: string
  name: string
  owner?: string // chủ đầu tư
  location?: string
  manager?: string // chủ nhiệm dự án
  budget?: number
  status: ProjectStatus
  /** Thời điểm bắt đầu dự án "YYYY-MM-DDTHH:mm" */
  start: string
  /** Ngày cập nhật tiến độ (ngày báo cáo), "YYYY-MM-DD" */
  statusDate?: string
  /** Dời phần việc chưa làm ra sau ngày cập nhật (dự báo ngày hoàn thành theo thực tế) */
  rescheduleAfterStatus?: boolean
  calendar: WorkCalendar
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  /** Mã cha trong cây WBS, null nếu ở cấp cao nhất */
  parentId: string | null
  /** Thứ tự trong cùng cha */
  order: number
  name: string
  /** Thời lượng (ngày làm việc). Bỏ qua với hạng mục tổng hợp. */
  duration: number
  /** Đơn vị khối lượng và khối lượng công việc (tùy chọn) */
  unit?: string
  quantity?: number
  responsible?: string
  notes?: string
  constraint: ConstraintType
  constraintDate?: string // "YYYY-MM-DDTHH:mm"
  /** Theo dõi thực tế */
  percentComplete: number // 0..100
  actualStart?: string
  actualFinish?: string
  /** Chi phí cố định gắn trực tiếp vào công việc */
  fixedCost?: number
}

export interface Link {
  id: string
  predecessorId: string
  successorId: string
  type: LinkType
  /** Thời gian chờ (ngày làm việc), âm = gối đầu */
  lag: number
}

export interface Resource {
  id: string
  name: string
  type: ResourceType
  /** Đơn vị: người/ngày cho nhân công, m2, m3, tấn... cho vật tư, ca cho máy */
  unit?: string
  /** Đơn giá: theo ngày công (work), theo đơn vị (material) */
  rate: number
  /** Chi phí mỗi lần sử dụng */
  costPerUse: number
  group?: string // tổ đội, nhóm vật tư
  /** Máy thi công là nguồn lực work có đơn vị ca */
  isEquipment?: boolean
}

export interface Assignment {
  id: string
  taskId: string
  resourceId: string
  /** work: số người/máy; material: khối lượng; cost: số tiền */
  units: number
}

export interface BaselineEntry {
  taskId: string
  start: string
  finish: string
  duration: number
  cost: number
}

export interface Baseline {
  id: string
  name: string
  createdAt: string
  entries: BaselineEntry[]
}

export interface ProjectData {
  project: Project
  tasks: Task[]
  links: Link[]
  resources: Resource[]
  assignments: Assignment[]
  baselines: Baseline[]
}
