# Hướng dẫn chạy checker CyberRange và ForcAD

Tài liệu ghi lại bản thử nghiệm đã thiết lập trên máy Windows và sandbox Pool 101. Các lệnh phải chạy đúng nơi được chỉ rõ. Bản thử này theo dõi trạng thái HTTP; chưa phải cuộc thi Attack & Defence hoàn chỉnh.

## 1. Sơ đồ

```text
CyberRange sandbox (Pool 101)
  attacker1 10.80.0.11 ─┐
  attacker2 10.80.0.12 ─┤  HTTP /health, cổng 80
  attacker3 10.80.0.13 ─┤──> checker 10.80.0.30
  attacker4 10.80.0.14 ─┘        │
                         SQLite: results.sqlite3
                                  │ SSH, Windows chủ động kết nối vào
Windows                          ▼
  collect_checker.py → latest.json → adapter ForcAD → scoreboard
```

- Checker chạy mỗi 60 giây, lưu một lượt gồm bốn kết quả `UP`/`DOWN` trên máy checker.
- Collector trên Windows lấy lượt mới nhất qua SSH mỗi 15 giây. ForcAD chạy kiểm tra theo vòng của nó, nên bảng điểm có thể trễ hơn kết quả gốc.
- SQLite gốc: `/var/lib/web-checker/results.sqlite3` trên checker. Dữ liệu trên VM có thể mất nếu sandbox bị xóa; cần sao lưu trước khi xóa.
- `UP` nghĩa là endpoint `/health` trả nội dung mong đợi. Chưa kiểm tra đăng nhập, nghiệp vụ IDOR, đặt/đọc flag hay chấm điểm thi chính thức.

## 2. Vị trí trên máy Windows

- Cấu hình sandbox nguồn: `C:\Users\Nguyen Thanh Dat\Documents\AN TOAN THONG TIN\LUAN VAN TOT NGHIEP ATTT\CYBERRANGECZ\idor-c-main`.
- Repo gốc: `https://github.com/NguyenThanhDatttttttt/MekoDataCTF`.
- Bản ForcAD đã chạy thử và tùy chỉnh: `C:\Users\Nguyen Thanh Dat\Documents\ChatGPT\LUAN VAN TOT NGHIEP\ForcAD-demo`.
- SSH config: `C:\Users\Nguyen Thanh Dat\Documents\ChatGPT\LUAN VAN TOT NGHIEP\pool101-management-config`.
- SSH known hosts: file `pool101-known-hosts` ở cùng thư mục với SSH config.
- SSH private key Pool 101: đang nằm trong `Downloads\management-ssh-access (1)`. Config SSH trỏ tới vị trí đó. Không đưa private key, mật khẩu hay token lên Git hoặc chia sẻ cho đội thi.

Đây là bản cài đã tùy chỉnh: chỉ clone ForcAD gốc sẽ chưa có collector, adapter, cấu hình bốn đội và sửa lỗi lịch chạy không có PUT/GET.

## 3. Checker trong CyberRange

Repo sandbox có `topology.yml` tạo VM checker riêng tại `10.80.0.30`. Ansible trong `provisioning/playbook.yml` cài mã và service `web-checker` vào VM. Danh sách đích nằm trong `checker/web_targets.json`.

Khi thay đổi cấu hình repo, đưa thay đổi lên nhánh mà Sandbox Definition đang dùng rồi chạy lại provisioning hoặc tạo sandbox mới theo khả năng của CyberRange. Nếu sandbox cũ chưa có máy checker, chạy provisioning đơn thuần không tạo VM mới.

Trên terminal checker, xem service và log:

```bash
sudo systemctl status web-checker
sudo journalctl -u web-checker -n 4 --no-pager -o cat
sudo journalctl -u web-checker -f -o cat
```

Nhấn Ctrl+C để ngừng xem log; checker vẫn chạy. Xem 20 kết quả mới nhất trong SQLite:

```bash
sudo python3 - <<'PY'
import sqlite3
db = sqlite3.connect('file:/var/lib/web-checker/results.sqlite3?mode=ro', uri=True)
for row in db.execute('''
    SELECT c.id, c.checked_at, r.name, r.status, r.elapsed_ms, r.detail
    FROM check_cycles c JOIN check_results r ON r.cycle_id=c.id
    ORDER BY c.id DESC, r.name LIMIT 20
'''):
    print(*row, sep=' | ')
db.close()
PY
```

Thời gian `checked_at` trong SQLite là UTC; cộng 7 giờ để xem giờ Việt Nam.

## 4. Kết nối quản trị tới sandbox

Trên PowerShell Windows, kết nối checker:

```powershell
cd 'C:\Users\Nguyen Thanh Dat\Documents\ChatGPT\LUAN VAN TOT NGHIEP'
ssh -F .\pool101-management-config checker
```

Có thể thay `checker` bằng `attacker1` để quản trị máy đội 1. Config dành cho Pool 101 và sandbox cụ thể; nếu cấp sandbox/pool mới, tải **SSH Management Access** tương ứng và cập nhật config/key. Các host key trong lần thiết lập này đã được tin ở lần kết nối đầu, chưa đối chiếu fingerprint với quản trị viên. Nếu SSH cảnh báo host key thay đổi, dừng và xác minh trước khi tiếp tục.

Để tự đặt mật khẩu console cho tài khoản `debian` trên checker sau khi SSH vào:

```bash
sudo passwd debian
```

Nhập mật khẩu mới hai lần; khi nhập sẽ không hiện ký tự. Không nhập mật khẩu vào chat.

## 5. Chạy ForcAD và xem scoreboard

Mở Docker Desktop và đợi Engine chạy. Trên PowerShell Windows:

```powershell
cd 'C:\Users\Nguyen Thanh Dat\Documents\ChatGPT\LUAN VAN TOT NGHIEP\ForcAD-demo'
docker compose -f docker-compose-base.yml -f docker-compose-fast.yml start
docker compose -f docker-compose-base.yml -f docker-compose-fast.yml ps --all
```

Lệnh `start` dùng lại các container đã tạo; nếu container đã bị xóa, nó không tạo lại. Database ForcAD nằm trong `ForcAD-demo\docker_volumes\postgres\data`. Không dùng `control.py reset` hay xóa dữ liệu nếu muốn giữ kết quả; việc khởi tạo lại một database trống cũng tạo dữ liệu thử mới.

Mở trong trình duyệt trên chính Windows:

- Scoreboard: http://127.0.0.1:18080/
- Quản trị: http://127.0.0.1:18080/admin/

Để điều khiển round, đăng nhập quản trị rồi quay về scoreboard và refresh. Phần **Điều khiển round** cho phép bấm **Bắt đầu** hoặc **Dừng**. Ticker phải đang chạy; sau khi ticker khởi động lại, bộ điều khiển mặc định dừng và chờ quản trị viên bấm Bắt đầu. Các file BAT cũ sẽ mở scoreboard để dùng nút này.

Nút Dừng ngừng lập lịch các round mới; tác vụ đã được gửi vẫn có thể hoàn thành. Đồng hồ/hiển thị thời gian và thời hạn cờ chưa được triển khai như một cơ chế tạm dừng thi hoàn chỉnh; không dùng bản thử này để kết luận luật tính giờ thi chính thức.

Để reset dữ liệu điểm của bản thử: bấm **Dừng**, đợi ít nhất 30 giây, bấm **Reset round và điểm**, rồi xác nhận. Nút chỉ cho quản trị viên và chỉ hỗ trợ bài health chưa có flag: nó đưa tick và điểm về 0, xóa lịch sử kiểm tra ForcAD và số lượt thành công/thất bại. Nó giữ đội, bài và token; không xóa SQLite trên checker. Nếu còn tác vụ hoặc hàng đợi chưa ổn, thử lại sau.

Username quản trị là `forcad`; mật khẩu nằm trong `ForcAD-demo\config.yml`, mục `admin.password`. Cổng 18080 được chọn vì 8080 đã có ứng dụng khác sử dụng. Scoreboard bản này chỉ bind localhost; máy khác không truy cập trực tiếp được.

Trên bảng, `Sandbox HTTP health` là bài thử và `UP`/`DOWN` phản ánh dữ liệu gần nhất được adapter xử lý. Có 2 round liên tiếp, mỗi round 15 tick; tick đang đặt 60 giây. Mỗi tick UP được 1 điểm, DOWN được 0 điểm, tổng tối đa 30 điểm cho một dịch vụ. Khi lỗi checker hoặc dữ liệu trễ/trùng, trạng thái là CHECK FAILED và được tính là lượt cần ban tổ chức kiểm tra, không mặc định kết luận dịch vụ DOWN; bản thử chưa có công cụ chấm bù cho các lượt đó.

## 6. Chạy và dừng collector trên Windows

Collector cần chạy cùng ForcAD để lấy kết quả mới. Nó chưa tự khởi động sau khi Windows restart.

Kiểm tra trước xem collector đã chạy chưa:

```powershell
Get-CimInstance Win32_Process -Filter "name='pythonw.exe'" |
  Where-Object { $_.CommandLine -match 'collect_checker\.py' } |
  Select-Object ProcessId, CommandLine
```

Nếu không thấy dòng nào, chạy:

```powershell
$bridgeDir = 'C:\Users\Nguyen Thanh Dat\Documents\ChatGPT\LUAN VAN TOT NGHIEP\ForcAD-demo'
$pythonw = Join-Path (Split-Path (Get-Command python.exe).Source) 'pythonw.exe'
Start-Process -FilePath $pythonw -ArgumentList 'collect_checker.py' `
  -WorkingDirectory $bridgeDir -WindowStyle Hidden `
  -RedirectStandardOutput (Join-Path $bridgeDir 'collector.log') `
  -RedirectStandardError (Join-Path $bridgeDir 'collector-error.log')
```

Xem collector có lấy được dữ liệu mới hoặc gặp lỗi:

```powershell
Get-Content 'C:\Users\Nguyen Thanh Dat\Documents\ChatGPT\LUAN VAN TOT NGHIEP\ForcAD-demo\collector.log' -Tail 5
Get-Content 'C:\Users\Nguyen Thanh Dat\Documents\ChatGPT\LUAN VAN TOT NGHIEP\ForcAD-demo\collector-error.log' -Tail 5
```

Mất SSH hoặc dữ liệu quá 180 giây khiến adapter báo `CHECK FAILED` thay vì `DOWN`. Chưa có cơ chế chấm điểm chính thức loại trừ lỗi hạ tầng; cần xử lý việc này trước khi thi thật.

Để dừng collector, trước tiên chạy lệnh kiểm tra tiến trình ở trên. Sau khi xác định đúng **ProcessId** của `collect_checker.py`, dùng:

```powershell
Stop-Process -Id <ProcessId>
```

Thay `<ProcessId>` bằng con số thực tế, không giữ dấu `< >`. Đừng dừng các tiến trình Python khác.

## 7. Thử DOWN rồi bật lại

`user-access` trên VM đội không có sudo. Dùng SSH management từ PowerShell trên Windows:

```powershell
cd 'C:\Users\Nguyen Thanh Dat\Documents\ChatGPT\LUAN VAN TOT NGHIEP'
ssh -F .\pool101-management-config attacker1
```

Trong terminal attacker1:

```bash
sudo systemctl stop attacker-http@attacker1
systemctl is-active attacker-http@attacker1
```

`inactive` cho biết web đã dừng. Đợi khoảng 1–3 phút và xem team01 trên scoreboard; thời gian thực tế phụ thuộc hai lịch kiểm tra. Bật lại sau khi thử:

```bash
sudo systemctl start attacker-http@attacker1
systemctl is-active attacker-http@attacker1
```

Đợi checker và ForcAD cập nhật về UP. Việc thử DOWN có thể ảnh hưởng điểm của bản thử.

## 8. Dừng phiên thử

1. Bật lại web team01 nếu đã dừng ở bước 7.
2. Dừng collector theo mục 6.
3. Trên PowerShell, dừng các container của riêng bản thử:

```powershell
cd 'C:\Users\Nguyen Thanh Dat\Documents\ChatGPT\LUAN VAN TOT NGHIEP\ForcAD-demo'
docker compose -f docker-compose-base.yml -f docker-compose-fast.yml stop
```

Checker bên trong CyberRange tiếp tục chạy và lưu SQLite. Dừng các container không xóa database; không dùng `down -v` hoặc xóa sandbox nếu cần giữ dữ liệu.

## Kiểm tra và chấm điểm theo tick (cập nhật 28/10/2026)

- Khi bấm Bắt đầu, tick hiện tại chờ đủ 60 giây. Điểm chưa tăng ngay. Sau đó ticker yêu cầu một lượt kiểm tra mới trong sandbox, chờ collector lấy kết quả qua SSH, rồi chấm từng đội: UP +1, DOWN +0.
- Mỗi kết quả gắn với mã yêu cầu và tick; kết quả cũ hoặc sai tick không được dùng để chấm. Nếu không lấy được kết quả, trạng thái là CHECK FAILED/cần kiểm tra, không coi là UP. Việc kiểm tra diễn ra ngay sau mốc 60 giây; điểm có thể xuất hiện muộn vài giây do SSH và xử lý.
- Dừng rồi bắt đầu lại sẽ chờ một tick đủ 60 giây mới chấm tiếp. Đến hết tick 30 hệ thống tự dừng. Round 1 gồm tick 1–15, round 2 gồm tick 16–30.
- Trên Windows cần chạy đúng một collector `python collect_checker.py` trong thư mục `ForcAD-demo`, ngoài Docker Compose và sandbox. Không chạy đồng thời nhiều collector. Máy checker trong sandbox vẫn có thể ghi các lần kiểm tra định kỳ; các lần đó không trực tiếp được dùng để chấm tick.
- Mỗi lần khởi động lại Windows cần khởi động lại collector. Sau khi thay đổi source backend, build lại và khởi động lại các container tương ứng. Khi cập nhật, cuộc thi được giữ tạm dừng và điểm cũ không tự xóa.
