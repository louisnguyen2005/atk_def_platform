# PROMPT — Nâng cấp frontend "World Arena" (bản đồ Attack/Defense trực quan)

> Dán toàn bộ nội dung dưới đây cho một AI coding assistant (hoặc dùng làm đặc tả khi tự code).
> Prompt đã được viết bám đúng mã nguồn hiện có trong `MekoDataCTF_Website/`.

---

## BỐI CẢNH DỰ ÁN

Bạn đang làm việc trong repo `MekoDataCTF_Website` — website Node.js/Express (MVC, EJS, SQLite), song ngữ Việt/Anh, phục vụ cuộc thi CTF **Attack–Defense** tên *MekoDataCTF*. Trang `/scoreboard` ("World Arena") hiển thị bản đồ giả tưởng với **4 đội** (team01–04) dưới dạng 4 căn cứ cố định, lấy dữ liệu trực tiếp từ hệ thống chấm điểm ForcAD qua proxy chỉ-đọc.

**Các file liên quan (KHÔNG đổi kiến trúc, chỉ nâng cấp giao diện + hiệu ứng):**
- `views/scoreboard.ejs` — markup bản đồ SVG, 4 căn cứ, bảng xếp hạng, feed capture, form nộp flag.
- `public/js/arena.js` — polling `tick-status` + `teams`, dựng bảng xếp hạng, đồng hồ tick, phát sự kiện `arena-scores-updated`.
- `public/js/world.js` — polling `arena`, vẽ đường đạn tấn công (capture-line) từ attacker → victim, cập nhật trạng thái service từng căn cứ, feed capture, form nộp flag.
- `public/css/arena.css`, `public/css/world.css` — style bản đồ, căn cứ, khiên (`.base-shield`), đường đạn (`.capture-line`), trạng thái (`.service-alert`).
- `routes/scoreboard.js` — proxy `/scoreboard/data/{tick-status,teams,arena}` và `POST /scoreboard/submit`. **Chỉ proxy chỉ-đọc, không chuyển cookie/admin.**

**Nguồn dữ liệu đang có (không tự bịa thêm field):**
- `GET /scoreboard/data/tick-status` → `{ mode, round, tick, phase, deadline, tick_seconds, ticks_per_round, max_rounds, running, overall_tick, scores: [{ team_id, name, total, sla, attack, defense }], results }`
- `GET /scoreboard/data/teams` → `[{ id, name }]`
- `GET /scoreboard/data/arena` → `{ services: [{ team, service, status }], captures: [{ tick, attacker, attacker_id, victim, victim_id, capture_flag_id, service, submit_time }], checks: [{ tick, team, status, points }] }`
  - `status` theo mã ForcAD: `101=UP, 102=CORRUPT, 103=MUMBLE, 104=DOWN, 110=ERROR, -1=NOT CHECKED`.
  - `captures` CHỈ chứa các lần **nộp flag thành công** (bảng StolenFlags).
- `POST /scoreboard/submit` → trả mảng `[{ msg }]`, phân loại hiện tại: `ACCEPTED / EXPIRED / INVALID / REJECTED`.

---

## MỤC TIÊU GIAO DIỆN (theo ảnh tham chiếu)

Biến World Arena thành một **bảng điểm chiến trường** giống ảnh mẫu: bản đồ tối kiểu quân sự, 4 căn cứ đội trên bản đồ, có **đạn bay (tracer)** giữa các đội khi có tấn công, **khiên** hiện lên khi đội phòng thủ/giữ dịch vụ, badge **SERVICE DOWN** đỏ, đồng hồ đếm ngược round và nhãn trạng thái trận.

Yêu cầu trình bày:
1. **Header trận**: dải nhãn `ROUND <n> ENDS IN mm:ss` (đếm ngược theo `deadline`/`tick_seconds`), nhãn trạng thái `BATTLE IN PROGRESS` khi `phase=running`, và dòng phụ `the board shows the last judged round` (hiệu ứng mô phỏng, không suy ra đội nào thực sự đang tấn công đội nào — giữ đúng tinh thần "Simulated effects only").
2. **4 căn cứ đội** (team01=Sói/Frostfang, team02=Hổ/Emberwood, team03=Đại bàng/Sunspire, team04=Gấu/Mosswater): mỗi căn cứ là một "huy hiệu" tròn hiển thị tên đội, **tổng điểm**, biến động điểm gần nhất (`+100`, `-300`…), và badge `SERVICE DOWN` khi có service ≠ UP. Đội đứng đầu có vương miện/viền vàng.
3. **Bảng xếp hạng trực tiếp** bên cạnh bản đồ: Hạng, Đội, Tổng, SLA (/ số tick), Attack, Defense (Defense có thể âm → tô đỏ). Dòng đổi điểm nhấp nháy.
4. Giữ **Capture ledger** (feed capture) và **Checker chronicle** (kết quả checker cuối tick).
5. Responsive tới ~390px (đã test ở 1280×900 và 390×844; bảng không tràn ngang).

---

## HIỆU ỨNG & LUẬT ĐIỂM CẦN THỂ HIỆN

> Đây là ĐẶC TẢ TRỰC QUAN cho frontend. Con số điểm thật do backend ForcAD quyết định; frontend chỉ hiển thị theo dữ liệu nhận được và chạy hiệu ứng tương ứng. Ở cuối prompt có mục "Hợp đồng dữ liệu" nêu rõ backend cần cấp gì để chạy đủ các hiệu ứng.

### 1. Tấn công thành công (Attack)
- Mỗi flag khai thác được của **một lỗ hổng** = **+100 điểm** cho đội tấn công.
- Khi phát hiện một **capture mới** (xuất hiện trong `captures` mà lần poll trước chưa có):
  - Bắn **một viên đạn/tracer** từ căn cứ `attacker` bay cong tới căn cứ `victim` (giữ `M… Q500 … …` như `world.js` hiện tại, nâng thành tracer có vệt sáng + đầu đạn).
  - Căn cứ attacker nhấp hiệu ứng `.attacking` (+100 nổi lên); căn cứ victim nhận `.hit` và hiển thị **−100** (mất flag → bị trừ, Defense giảm).
  - Dọn hiệu ứng sau ~3.5s (giữ nguyên vòng đời hiện tại).

### 2. SLA — giữ được dịch vụ qua hết một tick
- Nếu hết một tick mà đội vẫn **giữ được dịch vụ** (service UP, các chức năng còn đúng) → **+100 điểm SLA**.
- Khi đội được cộng SLA (nhận biết qua `checks`/`scores.sla` tăng): **bật khiên** `.base-shield` sáng lên quanh căn cứ trong vài giây kèm nhãn `+100 SLA`. Khiên là biểu tượng phòng thủ "giữ nhà".

### 3. Dịch vụ bị DOWN qua một tick (phạt khả dụng)
- Nếu dịch vụ của một đội bị **DOWN** trong một tick → đội đó bị trừ **100 × (số đội còn lại)**.
  - Ví dụ 4 đội A, B, C, D: A down 1 tick → **A −300** (100 × 3).
- Hiển thị: căn cứ bị down nhận badge đỏ `SERVICE DOWN`, hiệu ứng rung/tối, và số **−300** nổi lên. **Không** bật khiên cho đội đang down.

### 4. Phòng thủ thành công (Defense) — đòn tấn công bị chặn
Khi đội A nộp flag **cũ/không hợp lệ** của đội B, backend từ chối. Ba trường hợp cần thể hiện là **đòn bị chặn**:
1. **Flag hết hạn**: flag chỉ sống trong tick của nó (+ các tick hiệu lực); lấy ở tick này nhưng nộp sang tick khác → hết hạn (`EXPIRED`).
2. **Flag sai định dạng** (`INVALID`).
3. **Flag cũ đã được nộp rồi** (trùng/`REJECTED` — đã có trong StolenFlags).

Với cả ba: vẫn **bắn đạn** từ A sang B, nhưng B **phòng thủ được** — khi đạn chạm căn cứ B thì **bật khiên** `.base-shield` của B chặn lại (đạn vỡ/tan, không gây `.hit`, **không trừ điểm B**). Đây là tín hiệu "B đã bảo vệ thành công trước đòn của A". A **không** được cộng điểm trong trường hợp này.

> Phân biệt rõ hai loại đạn:
> - **Đạn trúng (capture thật)** → victim `.hit`, −100, không khiên.
> - **Đạn bị chặn (flag cũ/sai/hết hạn/trùng)** → victim bật **khiên**, đạn tan, không ai đổi điểm.

---

## HỢP ĐỒNG DỮ LIỆU (để chạy đủ hiệu ứng)

Frontend chạy được ngay các hiệu ứng (1), (2), (3) từ dữ liệu hiện có:
- (1) từ `captures` mới; (2) từ `checks`/`scores.sla` tăng; (3) từ `services[].status == 104` kéo dài qua tick + `scores.defense` giảm.

Hiệu ứng (4) "đòn bị chặn" **chưa có nguồn**, vì `captures` chỉ chứa lần nộp thành công. Hãy làm theo thứ tự ưu tiên:
1. **Trước mắt (chỉ frontend):** khi người dùng nộp flag ngay trên trang này qua `POST /scoreboard/submit`, dùng kết quả `EXPIRED/INVALID/REJECTED` để bắn đạn-bị-chặn từ đội của token sang đội mục tiêu (nếu suy ra được), phục vụ demo tại chỗ.
2. **Đầy đủ (cần backend):** đề xuất bổ sung một feed sự kiện phòng thủ, ví dụ `arena.defends: [{ tick, attacker, victim, service, reason: 'expired'|'invalid'|'duplicate', time }]` trong `ForcAD-demo/backend/services/api/views.py` (endpoint `/api/client/arena/`) và nới proxy `routes/scoreboard.js` để chuyển thêm `defends`. Frontend lắng nghe `defends` mới để chạy hiệu ứng khiên. **Ghi chú rõ** phần backend này nằm ngoài phạm vi "chỉ frontend" và cần xác nhận trước khi sửa.

Nếu một hiệu ứng thiếu dữ liệu, hiển thị trạng thái trung thực (ví dụ "chưa có sự kiện phòng thủ"), KHÔNG bịa capture/điểm giả khi tải trang.

---

## RÀNG BUỘC KỸ THUẬT

- Vanilla JS + SVG như hiện tại (không thêm framework nặng). Có thể tách CSS animation cho tracer/khiên.
- Giữ nguyên cơ chế polling 5s và vòng đời hiệu ứng; không gọi API admin, không đọc cookie, không lưu token vào storage/URL (token chỉ trong input + body/header, đúng như hiện tại).
- Không đổi luật chấm điểm phía backend trong phạm vi task frontend; mọi con số lấy từ API. Nếu cần field mới, nêu thành đề xuất (mục Hợp đồng dữ liệu).
- Hiệu ứng là **mô phỏng trực quan**: giữ dòng chú thích "Simulated effects only — they do not show which team is really attacking which".
- Giữ a11y: `role=status`, `aria-label`, tương phản màu đủ ở nền tối; chạy mượt trên màn chiếu lớn.
- Không commit secret; không hiển thị giá trị flag/token trên bản đồ hay feed.

## TIÊU CHÍ HOÀN THÀNH

1. Bản đồ + 4 căn cứ + bảng xếp hạng hiển thị đúng điểm từ API, giống bố cục ảnh mẫu.
2. Capture mới → đạn bay attacker→victim, attacker +100, victim −100 (`.hit`).
3. SLA tăng → đội bật khiên + nhãn +100 SLA.
4. Service down qua tick → badge SERVICE DOWN + số trừ = 100 × (số đội còn lại).
5. Nộp flag cũ/sai/hết hạn/trùng → đạn bị chặn, đội mục tiêu bật khiên, không trừ điểm.
6. Responsive ~390px, không tràn ngang; chú thích "mô phỏng" vẫn còn.
7. Không phá vỡ proxy chỉ-đọc, không rò token/flag/secret.
