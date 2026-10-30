import ast,copy,hashlib,json,pathlib,uuid
ROOT=pathlib.Path(__file__).resolve().parents[2]
SOURCE=pathlib.Path(r'C:\Users\Nguyen Thanh Dat\Documents\AN TOAN THONG TIN\LUAN VAN TOT NGHIEP ATTT\WEEKLY REPORT\WEEK 7\MEKODATACTF CU THE.mdj')
raw=SOURCE.read_bytes();model=json.loads(raw.decode('utf-8-sig'));original=copy.deepcopy(model)
tree=ast.parse((ROOT/'tools'/'modeling'/'fix_sequences.py').read_text(encoding='utf-8'))
functions=ast.Module(body=[x for x in tree.body if isinstance(x,ast.FunctionDef)],type_ignores=[])
code=ast.unparse(functions).replace('280 + i * 540','300 + i * 600').replace('width = xs[-1] + 280','width = xs[-1] + 650').replace('xa + 360','xa + 510').replace('lw = 350','lw = 510')
exec(compile(code,'<sequence-builder>','exec'),globals())
collab=next(n for n in nodes(model) if n.get('_type')=='UMLCollaboration')
assert not any(n.get('_type')=='UMLInteraction' and n.get('name')=='Đăng ký cuộc thi' for n in nodes(model))
inter=obj('UMLInteraction',collab['_id'],name='Đăng ký cuộc thi',ownedElements=[],participants=[],messages=[],fragments=[])
diagram=obj('UMLSequenceDiagram',inter['_id'],name='Đăng ký cuộc thi',ownedViews=[])
inter['ownedElements']=[diagram]
steps=[
msg(0,1,'31/10, 14:00 — Truy cập website và mở đăng ký cuộc thi'),
msg(1,0,'Hiển thị biểu mẫu tên đội và thông tin thành viên'),
msg(0,1,'Gửi tên Team01, 3 thành viên và email đội trưởng'),
msg(1,2,'Chuyển hồ sơ Team01 để kiểm tra thông tin'),
msg(2,1,'Yêu cầu đối chiếu tên đội và định danh thành viên'),
msg(1,1,'Đối chiếu tên đội; kiểm tra mã sinh viên và email'),
msg(1,2,'Cung cấp kết quả kiểm tra trùng hồ sơ'),
alt(('Tên đội và thành viên không trùng',[
msg(2,1,'Xác nhận hồ sơ hợp lệ và yêu cầu lưu đăng ký'),
msg(1,1,'Lưu Team01, 3 thành viên và email liên hệ'),
msg(1,3,'Gửi email xác nhận với nội dung trong ghi chú'),
msg(3,0,'Gửi email: tên đội, thành viên, cuộc thi và ngày giờ'),
msg(3,1,'Xác nhận đã gửi email cho đội trưởng'),
msg(1,0,'Thông báo đăng ký thành công; kiểm tra email')]),
('Trùng tên đội hoặc định danh thành viên',[
msg(2,1,'Thông báo tên đội hoặc thành viên bị trùng'),
msg(1,0,'Yêu cầu sửa thông tin; chưa xác nhận đăng ký')]))]
rebuild(inter,['Đội chơi Team01','Website / Hệ thống cuộc thi','Ban tổ chức','Bộ phận gửi thông báo'],steps)
diagram=inter['ownedElements'][0];diagram['showSequenceNumber']=True;diagram['showActivation']=False
context='TÌNH HUỐNG MINH HỌA: Team01 đăng ký ngày 31/10/2026, lúc 14:00. BTC kiểm tra tên đội và thành viên trước khi lưu hồ sơ. Thành viên được đối chiếu bằng mã sinh viên/email; chỉ trùng họ tên chưa đủ kết luận là cùng người. Hồ sơ hợp lệ mới được lưu và gửi email xác nhận. Đăng ký thành công là điều kiện để chuyển sang bước Tạo tài khoản.'
email='''EMAIL XÁC NHẬN MINH HỌA
Người nhận: an.team01@example.com (email đội trưởng)
Tiêu đề: [MEKODATACTF] Xác nhận đăng ký đội Team01
Đội Team01 đã đăng ký cuộc thi MEKODATACTF Demo thành công.
Danh sách thành viên:
1. Nguyễn Văn An — SV001 — an.team01@example.com — Đội trưởng
2. Trần Minh Bình — SV002 — binh.team01@example.com
3. Lê Thu Hà — SV003 — ha.team01@example.com
Thông tin cuộc thi: CTF Attack–Defense; mỗi đội 1 máy ảo, 2 round, mỗi round 5 tick.
Ngày thi: 01/11/2026. Giờ bắt đầu: 09:00. Giờ kết thúc: 09:20 (giờ Việt Nam).
Hướng dẫn: BTC sẽ thông báo tài khoản và cách truy cập ở bước tiếp theo.
Tên người, mã sinh viên và email ở đây là dữ liệu minh họa.'''
inter['documentation']=context+'\n\n'+email
# Reserve room for a concise context note beneath participant headers.
for v in nodes(diagram['ownedViews']):
 typ=v.get('_type','')
 if typ=='UMLFrameView':v['height']+=130
 elif typ in ('UMLSeqLifelineView','UMLLinePartView'):v['height']+=130
 elif 'top' in v and v['top']>=130:v['top']+=130
 if 'points' in v:v['points']=';'.join(f'{float(p.split(":")[0]):g}:{float(p.split(":")[1])+130:g}' for p in v['points'].split(';'))
frame=next(v for v in diagram['ownedViews'] if v['_type']=='UMLFrameView')
diagram['ownedViews'].append(obj('UMLNoteView',diagram['_id'],left=75,top=140,width=frame['width']-140,height=100,font='Arial;13;0',parentStyle=False,text=context,wordWrap=True))
emailtop=frame['top']+frame['height']+30
diagram['ownedViews'].append(obj('UMLNoteView',diagram['_id'],left=75,top=emailtop,width=frame['width']-140,height=290,font='Arial;14;0',parentStyle=False,text=email,wordWrap=True))
replies={2,7,12,13,15}
for num,mm in enumerate(inter['messages'],1):
 if num in replies:mm['messageSort']='reply'
before=next(i for i,d in enumerate(collab['ownedElements']) if d.get('_type')=='UMLInteraction' and d.get('name','').strip()=='Tạo tài khoản')
collab['ownedElements'].insert(before,inter)
registration='Trước bước Tạo tài khoản: đội đăng ký tên đội và thông tin thành viên trên website; BTC kiểm tra trùng, hồ sơ hợp lệ được lưu và gửi email xác nhận có tên đội, danh sách thành viên, thông tin cuộc thi và ngày giờ.'
model['documentation']=model.get('documentation','').replace('12 sơ đồ mới','13 sơ đồ mới')+'\n'+registration
overview=next(n for n in nodes(model) if n.get('_type')=='UMLClassDiagram' and n.get('name')=='00 - Bối cảnh và quy tắc kịch bản')
for v in overview['ownedViews']:
 if v.get('_type')=='UMLNoteView':v['text']=v.get('text','').replace('12 sơ đồ mới','13 sơ đồ mới')+'\n'+registration;v['height']+=100
ids=[n['_id'] for n in nodes(model) if '_id' in n];assert len(ids)==len(set(ids));allids=set(ids)
assert not [n['$ref'] for n in nodes(model) if '$ref' in n and n['$ref'] not in allids]
# Every pre-existing sequence, including both excluded examples, is unchanged.
old=[n for n in nodes(original) if n.get('_type')=='UMLInteraction']
new={n['_id']:n for n in nodes(model) if n.get('_type')=='UMLInteraction'}
for n in old:assert n==new[n['_id']],n.get('name')
assert len(new)==len(old)+1
order=[n.get('name') for n in collab['ownedElements'] if n.get('_type')=='UMLInteraction']
assert order.index('Đăng ký cuộc thi')+1==order.index('Tạo tài khoản')
assert len(inter['messages'])==15
assert SOURCE.read_bytes()==raw
out=ROOT/'models'/'mekodatactf'/'MEKODATACTF CU THE.mdj';out.write_text(json.dumps(model,ensure_ascii=False,indent=2),encoding='utf-8')
assert json.loads(out.read_text(encoding='utf-8'))==model
(ROOT/'docs'/'mekodatactf'/'DANG_KY_CUOC_THI_VA_EMAIL.md').write_text('# Đăng ký cuộc thi\n\n'+context+'\n\n## Email xác nhận\n\n'+email,encoding='utf-8')
print(json.dumps({'output':str(out),'source_sha256':hashlib.sha256(raw).hexdigest(),'output_sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'messages':len(inter['messages']),'existing_sequences_preserved':len(old),'new_order':order},ensure_ascii=False))
