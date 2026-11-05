# MekoDataCTF Crypto A/D

Bộ lab dành cho **hai đội**. Mỗi đội có một Debian VM chạy đồng thời ba dịch vụ line-JSON; VM checker đặt flag theo vòng, kiểm tra ba service, tính attack/defense/SLA và phục vụ scoreboard. Giao diện nối vào `/scoreboard` của website MekoDataCTF đang có.

Các bài mô phỏng cơ chế lỗi để luyện tập. Đây không phải Windows CryptoAPI có CVE-2020-0601 hoặc một bản OpenSSL dễ khai thác. Mỗi dịch vụ vẫn là TCP newline-delimited JSON; kết nối bằng `ncat HOST PORT`, mỗi yêu cầu là một object JSON trên một dòng.

| Bài | Cổng trên mỗi VM | Lỗi mô phỏng | Bản vá mẫu |
|---|---:|---|---|
| `curveball` | `9011` | Chấp nhận generator P-256 do người gửi chọn; ký giả cert bằng `G′=Q`, khóa `d′=1` | So sánh generator với P-256 chuẩn |
| `padding_oracle` | `9012` | AES-CBC phân biệt lỗi padding và lỗi nội dung | HMAC theo record+ciphertext, kiểm tra MAC trước giải mã và trả cùng một lỗi |
| `ecdsa_nonce` | `9013` | ECDSA giữ lại và dùng lại cùng nonce `k` | RFC 6979 theo từng message |

## Demo trên máy hiện tại

IP Wi‑Fi hiện tại là `10.13.132.126`. Bản demo cấp cổng ngoài khác nhau cho hai đội nhưng vẫn dùng cùng ba protocol:

| Đội | Curveball | Padding Oracle | ECDSA Nonce |
|---|---:|---:|---:|
| Team 01 | `10.13.132.126:19111` | `10.13.132.126:19112` | `10.13.132.126:19113` |
| Team 02 | `10.13.132.126:19211` | `10.13.132.126:19212` | `10.13.132.126:19213` |

Mở hai PowerShell trong thư mục gốc repository. Ở cửa sổ đầu:

```powershell
& .\crypto-lab\.venv\Scripts\python.exe .\crypto-lab\setup_demo.py --host 10.13.132.126
```

Mặc định demo tạo **ba đội** (`--teams 2` để quay lại hai đội; Team 03 dùng cổng `19311`–`19313`). Script chạy các TCP service và scoreboard API ở cổng `8088`, ghi token và log vào `crypto-lab/.secrets/`. Sau đó mở quy tắc tường lửa LAN đúng một lần từ PowerShell **Run as administrator**; quy tắc chỉ cho subnet Wi‑Fi hiện tại tới IP demo và các cổng cần thiết:

```powershell
powershell.exe -ExecutionPolicy Bypass -File .\crypto-lab\.secrets\firewall-demo.ps1
```

Ở cửa sổ thứ hai:

```powershell
npm.cmd --prefix .\MekoDataCTF_Website ci --no-audit --no-fund
npm.cmd --prefix .\MekoDataCTF_Website run seed
Set-Location .\MekoDataCTF_Website
npm.cmd start
```

Website admin demo được lưu trong `crypto-lab/.secrets/website-admin.txt`. Người xem mở `http://10.13.132.126:3000/scoreboard`; trang crypto độc lập để dự phòng nằm tại `http://10.13.132.126:8088/`. Scoreboard, hai đội mẫu và điểm ban đầu ở trạng thái sẵn sàng; trong mục Organizer, nhập key từ `crypto-lab/.secrets/admin.token` rồi chọn **Bắt đầu / tiếp tục**.

Người chơi chọn Team 01 hoặc Team 02; demo hiện sẵn team token riêng để thuận tiện thử. Bắt đầu mỗi vòng, mỗi service nhận một flag `MekoDataCTF{` + 32 chữ số hex + `}`. Lệnh lấy mục tiêu qua ncat, ví dụ:

```json
{"op":"targets"}
```

Sau khi lấy được ID của record, tiếp tục các bước trong `hints/curveball.md`, `hints/padding_oracle.md` hoặc `hints/ecdsa_nonce.md`. Dán flag đối phương lên scoreboard. Nộp đúng lần đầu được `Attack +1` và chủ VM bị mất flag nhận `Defense −1`; cướp một flag hai lần không cộng thêm điểm. Cuối mỗi vòng, mỗi flag của vòng đó chưa bị ai cướp và service vẫn `UP`/`PATCHED` cho chủ VM `Defense +1`. Mỗi vòng đủ cả ba service được `SLA +1`. Flag có hiệu lực ở vòng tạo và hai vòng sau. Một match chạy 15 vòng, mỗi vòng 120 giây.

### Thử exploit từ máy điều phối

Đây là script mẫu để kiểm tra luồng tấn công từ máy có checkout repository và Python venv. Script không được cài vào VM của đội. Trước tiên mở scoreboard, vào **Organizer**, rồi chọn **Bắt đầu / tiếp tục**. Nếu match đã `finished`, chọn **Reset điểm** rồi **Bắt đầu / tiếp tục** để tạo vòng mới. Chờ checker đặt flag và hiện trạng thái các service.

Team 02 tấn công Team 01 trên pool mới, khôi phục cả ba flag rồi nộp lên scoreboard:

```powershell
& .\crypto-lab\.venv\Scripts\python.exe .\crypto-lab\attack.py --host 10.81.0.11 --submit --scoreboard http://10.81.0.30:8088
```

Khi được hỏi, nhập team token của Team 02 từ `crypto-lab/.secrets/team2.token`; input không hiện trên màn hình. Team 01 tấn công Team 02 thì đổi host thành `10.81.0.12` và dùng token `team1.token`.

Với demo LAN, các VM mô phỏng dùng cổng khác nhau. Ví dụ Team 02 tấn công Team 01:

```powershell
& .\crypto-lab\.venv\Scripts\python.exe .\crypto-lab\attack.py --host 10.13.132.126 --curveball-port 19111 --padding-port 19112 --ecdsa-port 19113 --submit --scoreboard http://10.13.132.126:8088
```

Nộp từng flag đúng lần đầu sẽ tăng `Attack` của đội tấn công và giảm `Defense` của đội bị mất flag. Muốn xem request trực tiếp, kết nối bằng `ncat HOST PORT` rồi gửi từng object JSON trên một dòng; thuật toán nằm trong `hints/`.

## Tạo pool CyberRange mới

Không dùng Pool 101 hoặc các sandbox cũ. Tạo **sandbox definition mới** từ [`topology.yml`](topology.yml), sau đó tạo pool và training instance mới từ definition đó. Topology gồm `team1` (`10.81.0.11`), `team2` (`10.81.0.12`) và `checker` (`10.81.0.30`) trên `crypto-lan`. Sau khi instance đã chạy, lưu SSH management config của **pool mới** thành một file mới; config đó phải có alias `team1`, `team2`, `checker`. Không dùng `ops/pool101/management-config` — đó là thông tin của pool khác.

Từ PowerShell ở thư mục gốc, xem trước các host, rồi cài:

```powershell
& .\crypto-lab\.venv\Scripts\python.exe .\crypto-lab\deploy.py --ssh-config 'C:\path\to\new-pool-management-config' --dry-run
& .\crypto-lab\.venv\Scripts\python.exe .\crypto-lab\deploy.py --ssh-config 'C:\path\to\new-pool-management-config' --apply
```

Installer cài Python, PyCryptodome, ECDSA, ncat và OpenSSH; cấp một mật khẩu ngẫu nhiên riêng cho tài khoản `user-access` của mỗi VM; cài ba service; bật SSH password login trong lab; cài hints và source tham khảo; rồi bật scoreboard và checker. Mật khẩu người chơi nằm trong `.secrets/team1-login.txt` và `.secrets/team2-login.txt`; admin API key nằm trong `.secrets/admin.token`. Cất các file đó ngoài Git và chỉ gửi mật khẩu cho đúng đội.

URL scoreboard sau khi tạo đúng topology là `http://10.81.0.30:8088/`. Trên team VM dùng `ncat 10.81.0.11 9011` hoặc `ncat 10.81.0.12 9011`, đổi cổng thành `9012` hay `9013` cho hai bài còn lại. Từ máy người chơi, SSH tới IP VM với username `user-access` và mật khẩu trong file đội tương ứng.

### Vá service bằng SSH

Đăng nhập VM của đội mình, bật bản vá mẫu cho cả ba service và kiểm tra trạng thái trên scoreboard:

```bash
sudo /usr/local/sbin/crypto-redeploy team1 PATCHED=1
```

Trên Team 02, dùng `team2`. Lệnh ghi `PATCHED=1` vào config root-owned rồi restart đúng ba systemd unit của VM. Muốn quay về cấu hình lỗi để tiếp tục thi:

```bash
sudo /usr/local/sbin/crypto-redeploy team1 PATCHED=0
```

Người chơi cũng có thể sửa `/opt/crypto-lab/team1/service.py` hoặc `/opt/crypto-lab/team1/protocol.py` trong source tree của máy mình, sau đó restart riêng service đã sửa. Ví dụ:

```bash
sudo systemctl restart crypto-lab@team1-curveball.service
```

Source chỉ chạy dưới tài khoản `user-access` bên trong VM đội; quyền sudo được giới hạn cho ba service đó và lệnh đổi chế độ vá. Bản tham khảo đọc được dưới `/home/user-access/crypto-lab/src/`; hints nằm ở `/home/user-access/crypto-lab/hints/`.

### Dùng đăng nhập đội trên website

Sau khi có đúng hai đội đăng ký trên MekoDataCTF Website, đồng bộ tên/token đội sang checker:

```powershell
npm.cmd --prefix .\MekoDataCTF_Website run crypto:sync-teams
```

Token được gửi qua HTTPS/HTTP tới controller bằng API admin; script không in token. Website lưu session đội và tự chuyển token đó khi nộp flag. Nếu browser của người dùng mở trực tiếp checker scoreboard thì có thể đăng nhập/nộp bằng team token.

## API, chấm điểm và vận hành

- `GET /api/state` trả bảng điểm, phase/timer, tình trạng ba service mỗi VM và sự kiện cướp flag; không trả flag hoặc checker token.
- `GET /api/admin/state` và `POST /api/admin/action` yêu cầu Bearer admin key.
- `POST /api/submit` yêu cầu `X-Team-Token` và danh sách flags. Website truyền token của session đăng nhập; token của đội khác trong body bị bỏ qua.
- Action `start`, `pause`, `retry`, `reset` được bảo vệ bằng admin key. Restart checker giữ dữ liệu; nếu đang chạy, checker dừng ở `paused` và đợi BTC tiếp tục.
- Mỗi record mới dùng CSPRNG; checker xác nhận flag đã được lưu và chạy thao tác chức năng hợp lệ. Service lỗi được hiển thị `DOWN`; bản vá mẫu hiện `PATCHED`.
- Trên CyberRange, controller chạy trên checker; dashboard độc lập dùng `:8088`. Có thể trỏ `.env` Website tới `http://10.81.0.30:8088` trong mạng range để dùng chung dashboard tại `/scoreboard`.

Mã nguồn services là bài luyện tập có thể đọc và sửa. Không dùng các triển khai này để cung cấp mật mã cho người dùng thật.

## Sân đấu 3D trên dashboard

Đầu trang scoreboard là sân đấu WebGL dựng bằng Three.js r160, đã đặt sẵn trong `dashboard/vendor/three/` nên chạy được khi không có Internet và hợp với CSP `script-src 'self'` của website. Mã nguồn nằm trong `dashboard/arena3d/`:

- `main.js` chọn bản 3D khi màn hình rộng từ 900 px và có WebGL2. Nếu không, hoặc khi thêm `?arena=2d` vào URL, trang dùng bản 2D (`dashboard/arena.js`).
- `ships.js` dựng ba phi thuyền bằng code theo dáng ba ảnh mẫu: Team 01 Raptor, Team 02 Ember, Team 03 Manta. Các chi tiết dùng chung vật liệu được gộp lại để mỗi tàu chỉ tốn khoảng 6 draw call.
- `scene.js` chứa nền không gian có chiều sâu (ảnh nền ở xa, sao warp, hạm đội 3D ở xa, sương mù), ánh sáng kim loại, bloom, hạt lửa động cơ, đạn plasma, nổ, khiên lục giác bằng shader và phần biên đạo:
  - Khi bị cướp flag: tàu tấn công quay về phía đối thủ, lao tới rồi khai hoả (`+1 ATK` / `−1 DEF`). Tàu bị bắn quay lại đối mặt, né sang bên, đôi khi cuộn thân.
  - Khi giữ được flag: tàu tiến lên và dựng khiên (`+N DEF`).

Bảng tên trên tàu chỉ hiện thứ hạng; đội #1 có vương miện. Nếu máy yếu, trang tự hạ độ phân giải rồi tắt bloom. `?fx=auto` tự phát hiệu ứng mô phỏng liên tục (chỉ animation, không đổi điểm).

**Thay bằng mô hình 3D thật:** đặt file `.glb` vào `dashboard/assets/models/` (mũi tàu hướng +Z, khoảng 50k tam giác, tối đa 5 MB) và khai báo trong `dashboard/assets/models/manifest.json`, ví dụ `{"raptor": "raptor.glb", "saucer": "ember.glb", "manta": "manta.glb"}`. Mô hình được tự căn giữa và chỉnh về cùng kích thước với tàu dựng sẵn. Key nào không khai báo, hoặc file lỗi, sẽ dùng tàu dựng bằng code.
