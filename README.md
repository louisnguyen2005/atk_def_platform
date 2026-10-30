# MEKOSHARING workspace

Thư mục gốc chứa các dự án độc lập; mã của từng ứng dụng nằm trong thư mục dự án tương ứng. Các file dùng chung được nhóm như sau:

- `MekoDataCTF_Website/`, `ForcAD-demo/`, `mekodata-publish/`, `MekoDataCTF-review/`, `checker-update/`, `round1-lab/`, `service-checker/`: các ứng dụng và môi trường lab.
- `tools/modeling/`: script tạo/chỉnh sửa mô hình StarUML.
- `tools/scenarios/`: dữ liệu và kịch bản chấm điểm.
- `tools/rendering/`: xuất ảnh xem trước sơ đồ.
- `tools/documents/`: script tạo tài liệu Word.
- `models/mekodatactf/`: các file mô hình `.mdj` đang dùng.
- `docs/`: hướng dẫn, giải thích luồng và tài liệu tham khảo.
- `assets/references/`: ảnh/tài nguyên đầu vào cho script.
- `artifacts/`: file xuất, bản phát hành và báo cáo tạo ra.
- `ops/pool101/`: cấu hình vận hành Pool 101.

Các script dùng đường dẫn dựa trên vị trí file, không yêu cầu chạy từ thư mục gốc. Ví dụ: `python tools/rendering/verify_concrete_render.py` (cần StarUML API hoạt động tại `127.0.0.1:58321`). Một số script tạo mô hình còn cần file nguồn riêng từ máy tác giả; đường dẫn nguồn bên trong script cần được cấu hình khi chạy trên máy khác.
