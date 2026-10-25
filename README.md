# Quản lý tiến độ thi công

Chương trình web lập và theo dõi tiến độ thi công xây dựng: hạng mục công việc (WBS), liên kết, tính đường găng (CPM), biểu đồ Gantt, sơ đồ mạng AON, nguồn lực và chi phí, theo dõi thực tế so với kế hoạch gốc. Giao diện tiếng Việt, ngày dd/mm/yyyy, tiền VNĐ.

Đây là giai đoạn 1 theo tài liệu [Yêu cầu Chương trình Quản lý dự án](https://claude.ai/artifact/7XjcbAt3TF1nptzpZhyzZk).

## Chức năng

| Mã yêu cầu | Chức năng |
|---|---|
| DA-01, DA-03 | Tạo dự án: tên, mã, chủ đầu tư, địa điểm, chủ nhiệm, ngày giờ khởi công, ngân sách, trạng thái |
| DA-02 | Lịch làm việc theo dự án: ngày làm trong tuần, ca làm (mặc định 7:30-11:30, 13:30-17:30, thứ Hai đến thứ Bảy), ngày lễ Việt Nam 2024-2030, ngày nghỉ đột xuất, ngày làm bù |
| CV-01 đến CV-04 | Cây WBS nhiều cấp tự đánh mã 1.2.3, thời gian theo ngày (cho phép nửa ngày), cột mốc 0 ngày, liên kết FS/SS/FF/SF có thời gian chờ hoặc gối đầu, ràng buộc ngày |
| CV-05 | Nhập tệp MS Project XML (Save As XML trong MS Project hoặc ProjectLibre), xuất lại XML để mở bằng MS Project |
| TD-01, TD-03, TD-07 | Tự tính ES, EF, LS, LF, dự trữ toàn phần TF, dự trữ riêng FF, đường găng; bảng CPM theo ngày thứ hoặc ngày lịch |
| TD-02 | Biểu đồ Gantt: sửa trực tiếp trên lưới, nhập cột "Việc trước" kiểu `2, 3SS+2, 5FF-1`, kéo thanh để dời ngày, kéo nối hai thanh để tạo liên kết, tô đỏ đường găng, hiện nguồn lực cạnh thanh |
| TD-07 | Sơ đồ mạng AON (ES, D, EF / LS, TF, LF trên từng nút), tải về dạng SVG |
| NS-01 đến NS-03, CP-01, CP-02 | Danh mục nguồn lực ba loại (nhân công / máy theo ngày, vật tư theo khối lượng, chi phí nhập tiền), phân bổ vào công việc, tự tính chi phí và cộng dồn lên hạng mục |
| TD-04, TD-05, CV-06 | Lưu kế hoạch gốc, nhập % hoàn thành và ngày bắt đầu / kết thúc thực tế, ngày cập nhật, dời phần việc còn lại ra sau ngày cập nhật, so sánh lệch ngày, cảnh báo trễ hạn, chậm, sắp đến hạn |
| TD-06 | Xuất Excel (tiến độ, thông số CPM, nguồn lực), in trang |
| Phi chức năng | Hoàn tác / làm lại (Ctrl+Z, Ctrl+Y), tự lưu, sao lưu và khôi phục JSON, cài lên điện thoại (PWA), 2.000 công việc mở Gantt khoảng 1,2 giây |

## Độ chính xác của bộ tính tiến độ

Bộ tính CPM được kiểm thử với tệp bài tập thật `10.12.2024 - Bai tap tren lop.mpp` (Ví dụ 7A, chuyển sang XML bằng MPXJ, nằm ở `src/samples/vi-du-7a.xml`):

| Công việc | Thời gian | Bắt đầu | Kết thúc | Chi phí |
|---|---|---|---|---|
| Cột mốc bắt đầu | 0 | 23/12/2024 | 23/12/2024 | 0 |
| Gia công lắp dựng cốt pha | 10 ngày | 23/12/2024 | 04/01/2025 | 56.400.000 |
| Đổ bê tông | 1 ngày | 04/01/2025 | 06/01/2025 | 63.500.000 |
| Vệ sinh | 1 ngày | 06/01/2025 | 07/01/2025 | 1.200.000 |
| Cột mốc kết thúc | 0 | 07/01/2025 | 07/01/2025 | 0 |

Kết quả trùng với MS Project đến từng giờ (lịch thứ Hai đến thứ Bảy, nghỉ 01/01/2025, khởi công 8:00), tổng 121.100.000 ₫. Ví dụ VD-8B (khởi công 16/12/2024) cũng cho đúng ngày. Ngoài ra còn kiểm thử các trường hợp SS, FF, SF, gối đầu, nửa ngày, ràng buộc, vòng kín, hạng mục tổng hợp, cập nhật thực tế.

## Chạy thử trên máy

Cần Node.js 20 trở lên.

```bash
npm install
npm run dev        # mở http://localhost:5173
npm test           # chạy kiểm thử
npm run build      # đóng gói vào thư mục dist/
```

Khi chưa cấu hình Supabase, chương trình lưu dữ liệu trong trình duyệt (chế độ "Lưu trên máy"): một máy, một người dùng, nhớ xuất sao lưu định kỳ. Mở menu "Dự án mẫu" để xem ngay dự án Nhà phố 3 tầng hoặc Ví dụ 7A.

## Dùng nhiều người (Supabase)

1. Tạo dự án miễn phí tại [supabase.com](https://supabase.com).
2. Vào SQL Editor, chạy toàn bộ tệp `supabase/migrations/20261025000000_init.sql`. Tệp tạo bảng, phân quyền theo dòng (RLS) và nhật ký sửa đổi.
3. Vào Project Settings > API, chép `Project URL` và `anon public key`.
4. Tạo tệp `.env` từ `.env.example` và điền hai giá trị trên, rồi chạy lại `npm run dev`.

Khi đã cấu hình, chương trình yêu cầu đăng nhập. Người tạo dự án là Quản trị dự án và thêm thành viên bằng email ở tab Thiết lập:

| Vai trò | Quyền |
|---|---|
| Quản trị, Chủ nhiệm dự án / Ban QLDA | Sửa toàn bộ tiến độ, nguồn lực, thành viên |
| Nhà thầu / Tổ trưởng | Xem, cập nhật % hoàn thành và ngày thực tế |
| Chủ đầu tư, Tư vấn thiết kế / giám sát | Chỉ xem |

Mọi thay đổi trên công việc, liên kết, nguồn lực được ghi vào bảng `audit_log` (ai sửa, lúc nào, giá trị trước và sau). Lược đồ được kiểm thử bằng PostgreSQL nhúng (PGlite) trong `src/data/__tests__/schema.test.ts`.

## Đưa lên mạng (Vercel)

Kết nối repo này với [Vercel](https://vercel.com), chọn framework Vite, thêm hai biến môi trường `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`. Mỗi lần đẩy code lên nhánh chính, Vercel tự đóng gói và cập nhật.

## Cấu trúc mã nguồn

```
src/core/        Lõi tính toán, không phụ thuộc giao diện (có kiểm thử)
  calendar.ts    Lịch làm việc, quy đổi phút làm việc <-> ngày giờ
  cpm.ts         Tính ES/EF/LS/LF, dự trữ, đường găng, cập nhật thực tế
  cost.ts        Chi phí theo nguồn lực
  mspdi.ts       Nhập / xuất MS Project XML
  tracking.ts    Kế hoạch gốc và so sánh thực tế
  holidays.ts    Ngày lễ Việt Nam
src/data/        Lưu trữ: trình duyệt (localRepo) hoặc Supabase (supabaseRepo)
src/store/       Trạng thái dự án đang mở, hoàn tác, tự lưu
src/components/  Gantt, bảng CPM, sơ đồ mạng, nguồn lực, theo dõi, thiết lập
supabase/        Lược đồ cơ sở dữ liệu
```

Thư viện chính: React, TypeScript, Vite, Ant Design, DHTMLX Gantt (bản MIT), Zustand, ExcelJS, Supabase.

## Giai đoạn sau

Theo tài liệu yêu cầu: biểu đồ nhân lực và điều hòa nguồn lực (NS-04, NS-07), PERT (TD-08), bảng tổng quan nhiều dự án (DA-04), nhập Excel, ảnh hiện trường, nhật ký thi công, EVM, hợp đồng và thanh toán.
