# ServiceDesk availability checker — bước 1

Python 3, không cần pip hay Docker. Đây là checker độc lập, chưa phải adapter ForcAD.
Chưa có đặt flag, nộp flag hoặc tính điểm. Không thay đổi ticket, không thử khai thác IDOR.

## Chọn cấu hình

- `config.source.json`: khớp mã nguồn được cung cấp: attacker1–4 cổng 80 (trang nhận diện), server 10.80.0.20:80 (ServiceDesk).
- `config.teams.json`: khớp mô hình ServiceDesk trên team01–04 cổng 8080 được mô tả trong hướng dẫn gateway. Phải xác nhận bản ứng dụng thực tế tương thích API portal.py trước khi dùng.

Ảnh topology có checker 10.80.0.30 và team01–04, nhưng topology.yml trong thư mục nguồn không có checker, lại có server 10.80.0.20. Không tự thêm provisioning dựa trên hai mô hình chưa khớp.

## Chạy trên máy checker có đường tới lab-lan

Chép thư mục này lên máy checker. Trong terminal Linux, chuyển tới thư mục chứa checker.py.
Đặt mật khẩu web alice thực tế, không phải mật khẩu SSH. Nhập ẩn, không ghi vào lịch sử shell:

```bash
read -rsp 'Team01 web password: ' CHECKER_TEAM01_PASSWORD; echo
export CHECKER_TEAM01_PASSWORD
read -rsp 'Team02 web password: ' CHECKER_TEAM02_PASSWORD; echo
export CHECKER_TEAM02_PASSWORD
read -rsp 'Team03 web password: ' CHECKER_TEAM03_PASSWORD; echo
export CHECKER_TEAM03_PASSWORD
read -rsp 'Team04 web password: ' CHECKER_TEAM04_PASSWORD; echo
export CHECKER_TEAM04_PASSWORD
python3 checker.py --config config.teams.json
```

Với config.source.json, đặt biến CHECKER_SERVER_PASSWORD thay cho bốn biến trên.
Không lấy mật khẩu mặc định trong source làm bằng chứng mật khẩu triển khai thực tế.
Có thể thêm expected_sandbox vào target để kiểm tra UUID sandbox mong đợi.
Nếu chạy từ Windows qua gateway, sửa URL trong bản sao config thành http://10.13.145.42:8011 tới :8014.

## Ý nghĩa kết quả

- UP: trang HTML, health và các chức năng được cấu hình kiểm tra đều thành công.
- DOWN: lỗi kết nối/HTTP, sai identity, hoặc chức năng không đúng.
- INCOMPLETE: health thành công nhưng thiếu mật khẩu nên chưa kiểm tra chức năng.
- Exit code: 0 tất cả UP; 1 có DOWN; 2 có INCOMPLETE và không có DOWN.

ServiceDesk được kiểm tra: trang chủ → health → đăng nhập alice → danh sách ticket của alice → đọc ticket của alice → đăng xuất.
Chỉ kiểm tra đường đọc, chưa kiểm tra cập nhật ticket. UP không chứng minh toàn bộ ứng dụng hay hệ điều hành đều tốt.
Timeout áp dụng từng request; toàn bộ lượt chạy có thể lâu hơn giá trị timeout.
Chạy một lượt trước, chưa tự cài vòng lặp hoặc dịch vụ nền.

## Kiểm chứng cục bộ

Test dùng portal.py thật, database tạm và HTTP localhost; thử thiếu/sai/đúng mật khẩu, sai sandbox, cả chế độ có và không vá quyền sở hữu.
Đặt PORTAL_SOURCE thành đường dẫn portal.py rồi chạy `python -m unittest -v test_checker.py`.
