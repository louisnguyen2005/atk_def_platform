import json, copy, uuid, pathlib, hashlib

SOURCE = pathlib.Path(r'C:\Users\Nguyen Thanh Dat\Documents\AN TOAN THONG TIN\LUAN VAN TOT NGHIEP ATTT\WEEKLY REPORT\WEEK 7\MEKODATACTF 23.10.26.mdj')
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'models' / 'mekodatactf' / 'MEKODATACTF 23.10.26 - QUAN NIEM.mdj'
raw = SOURCE.read_bytes()
model = json.loads(raw.decode('utf-8-sig'))
original = copy.deepcopy(model)
def nodes(x):
    if isinstance(x, dict):
        yield x
        for v in x.values(): yield from nodes(v)
    elif isinstance(x, list):
        for v in x: yield from nodes(v)
def uid(): return uuid.uuid4().hex
def ref(x): return {'$ref': x}
def obj(t, parent=None, **kw):
    d={'_type':t,'_id':uid()}
    if parent: d['_parent']=ref(parent)
    d.update(kw)
    return d
def label(parent,text,x,y,width=350,bold=False):
    return obj('LabelView',parent,text=text,left=x,top=y,width=width,height=16,font=f'Arial;13;{int(bold)}',parentStyle=True)
def msg(a,b,text): return (a,b,text)
def alt(*branches): return ('alt',branches)
def opt(guard,steps): return ('opt',[(guard,steps)])

B='Ban tổ chức'; H='Hệ thống quản lý cuộc thi'; T='Đội chơi'; Q='Bộ phận quản lý đề thi'; R='Bộ phận quản lý tài nguyên'; A='Bộ phận quản lý tài khoản'; E='Môi trường thi đấu'; K='Bộ phận kiểm tra dịch vụ'; P='Bộ phận tính điểm'; X='Bộ phận xác thực cờ'; Z='Bảng xếp hạng'; S='Bộ phận xử lý sự cố'; C='Bộ phận xử lý khiếu nại'; V='Bộ phận giám sát'
spec={
'Tạo tài khoản':([B,H,A,T],[msg(0,1,'Yêu cầu tạo tài khoản cho đội'),msg(1,1,'Kiểm tra thông tin đăng ký và điều kiện cấp tài khoản'),alt(('Đủ điều kiện',[msg(1,2,'Yêu cầu tạo tài khoản và cấp quyền'),msg(2,2,'Tạo tài khoản và thiết lập quyền truy cập'),msg(2,1,'Xác nhận kết quả tạo tài khoản'),msg(1,3,'Thông báo và cung cấp hướng dẫn kích hoạt'),msg(1,0,'Thông báo hoàn tất cấp tài khoản')]),('Chưa đủ điều kiện',[msg(1,0,'Thông báo lý do và yêu cầu bổ sung thông tin')]))]),
'Soạn đề thi':([B,H,Q],[msg(0,1,'Yêu cầu soạn đề và cung cấp yêu cầu nội dung'),msg(1,2,'Chuyển yêu cầu chuẩn bị đề thi'),msg(2,2,'Xây dựng thử thách theo mục tiêu cuộc thi'),msg(2,2,'Kiểm tra nội dung, độ khó và khả năng chấm thi'),msg(2,1,'Gửi đề thi đã chuẩn bị'),msg(1,0,'Trình đề thi để phê duyệt'),alt(('Đề thi đạt yêu cầu',[msg(0,1,'Phê duyệt đề thi'),msg(1,2,'Xác nhận đề thi được sử dụng'),msg(1,0,'Thông báo hoàn tất')]),('Đề thi chưa đạt yêu cầu',[msg(0,1,'Yêu cầu chỉnh sửa đề thi'),msg(1,2,'Chuyển yêu cầu chỉnh sửa và kiểm tra lại')]))]),
'Cấp phát tài nguyên':([B,H,R,T],[msg(0,1,'Yêu cầu cấp môi trường cho các đội hợp lệ'),msg(1,2,'Yêu cầu đánh giá khả năng cấp phát'),msg(2,2,'Kiểm tra tài nguyên và điều kiện cấp phát'),alt(('Cấp phát thành công',[msg(2,2,'Cấp và gán môi trường cho từng đội'),msg(2,2,'Kiểm tra mức sẵn sàng của môi trường'),msg(2,1,'Xác nhận môi trường và đội được cấp'),msg(1,3,'Cung cấp thông tin và hướng dẫn truy cập'),msg(1,0,'Thông báo kết quả cấp phát')]),('Thiếu tài nguyên hoặc cấp phát thất bại',[msg(2,1,'Báo nguyên nhân và nhu cầu xử lý'),msg(1,0,'Thông báo để điều chỉnh hoặc cấp phát lại')]))]),
'Kiểm tra đăng nhập':([B,H,R,E],[msg(0,1,'Yêu cầu kiểm tra truy cập và mức sẵn sàng'),msg(1,2,'Yêu cầu kiểm tra môi trường của các đội'),msg(2,3,'Kiểm tra quyền và khả năng truy cập'),msg(3,2,'Cung cấp kết quả kiểm tra truy cập'),msg(2,3,'Kiểm tra hoạt động các dịch vụ cần thiết'),msg(3,2,'Cung cấp kết quả kiểm tra dịch vụ'),alt(('Môi trường đáp ứng yêu cầu',[msg(2,1,'Xác nhận môi trường sẵn sàng'),msg(1,0,'Thông báo kết quả kiểm tra đạt yêu cầu')]),('Môi trường chưa đáp ứng yêu cầu',[msg(2,2,'Xác định nguyên nhân và thực hiện khắc phục'),msg(2,3,'Kiểm tra lại sau khắc phục'),msg(3,2,'Cung cấp kết quả kiểm tra lại'),msg(2,1,'Báo kết quả và các vấn đề còn tồn tại'),msg(1,0,'Thông báo mức sẵn sàng và đề nghị xử lý tiếp')]))]),
'Phát đề thi':([B,H,Q,T],[msg(0,1,'Yêu cầu công bố đề thi'),msg(1,1,'Kiểm tra thời điểm và điều kiện công bố'),alt(('Đủ điều kiện công bố',[msg(1,2,'Yêu cầu cung cấp đề thi đã phê duyệt'),msg(2,1,'Cung cấp nội dung đề và hướng dẫn thi'),msg(1,1,'Công bố đề cho các đội có quyền nhận'),msg(1,3,'Thông báo đề thi và thông tin được phép công bố'),msg(1,0,'Xác nhận đã công bố đề thi')]),('Chưa đủ điều kiện công bố',[msg(1,0,'Thông báo lý do chưa thể công bố đề')]))]),
'Tính điểm tấn công':([T,H,X,P,Z],[msg(0,1,'Nộp cờ thu được từ đội đối phương'),msg(1,2,'Yêu cầu xác thực cờ và đội nộp'),msg(2,2,'Kiểm tra cờ, thời hạn, đội sở hữu và nộp trùng'),alt(('Cờ được chấp nhận',[msg(2,3,'Cung cấp kết quả xác thực để tính điểm'),msg(3,3,'Tính và ghi nhận điểm tấn công theo quy chế'),msg(3,4,'Cập nhật điểm và thứ hạng'),msg(3,1,'Xác nhận kết quả ghi điểm'),msg(1,0,'Thông báo cờ được chấp nhận và kết quả điểm')]),('Cờ bị từ chối',[msg(2,1,'Cung cấp lý do từ chối cờ'),msg(1,0,'Thông báo cờ bị từ chối và lý do')]))]),
'Tính điểm phòng thủ':([H,X,P,Z],[msg(0,1,'Yêu cầu tổng hợp kết quả bảo vệ cờ của từng đội'),msg(1,1,'Tổng hợp cờ bị đối phương nộp hợp lệ trong kỳ'),msg(1,2,'Cung cấp kết quả bảo vệ cờ theo đội và kỳ tính điểm'),msg(2,2,'Áp dụng quy tắc điểm phòng thủ của cuộc thi'),msg(2,2,'Ghi nhận điểm phòng thủ của từng đội'),msg(2,3,'Cập nhật điểm và thứ hạng'),msg(2,0,'Cung cấp kết quả tính điểm phòng thủ')]),
'Duy trì dịch vụ':([K,E,P,Z],[msg(0,1,'Kiểm tra khả năng đáp ứng chức năng dịch vụ của các đội'),msg(1,0,'Cung cấp kết quả kiểm tra dịch vụ'),msg(0,0,'Đánh giá mức độ duy trì dịch vụ trong kỳ'),msg(0,2,'Gửi kết quả đánh giá khả dụng của từng đội'),msg(2,2,'Tính và ghi nhận điểm duy trì dịch vụ theo quy chế'),msg(2,3,'Cập nhật điểm và thứ hạng')]),
'Xử lí sự cố':([T,H,S,B,E],[msg(0,1,'Gửi báo cáo sự cố và thông tin liên quan'),msg(1,2,'Tiếp nhận và chuyển báo cáo sự cố'),msg(2,2,'Phân loại và đánh giá mức độ ảnh hưởng'),opt('Cần bổ sung thông tin',[msg(2,0,'Yêu cầu mô tả bổ sung về sự cố'),msg(0,2,'Cung cấp thông tin bổ sung')]),msg(2,4,'Xác minh tình trạng môi trường'),msg(4,2,'Cung cấp kết quả xác minh'),alt(('Có thể xử lý trong phạm vi được giao',[msg(2,4,'Thực hiện khắc phục sự cố'),msg(4,2,'Cung cấp kết quả kiểm tra sau khắc phục'),msg(2,1,'Báo kết quả xử lý và tình trạng còn tồn tại'),msg(1,0,'Thông báo kết quả và hướng xử lý tiếp theo')]),('Sự cố cần quyết định của ban tổ chức',[msg(2,3,'Báo mức độ ảnh hưởng và đề xuất xử lý'),msg(3,3,'Quyết định phương án xử lý sự cố'),msg(3,1,'Cung cấp quyết định và hướng dẫn thực hiện'),msg(1,0,'Thông báo phương án và tình trạng cuộc thi')]))]),
'Ghi nhận kết quả':([H,V,B,P,Z,T],[msg(0,3,'Yêu cầu tổng hợp kết quả thi đấu trong kỳ'),msg(3,0,'Cung cấp điểm tấn công, phòng thủ và duy trì dịch vụ'),msg(0,1,'Yêu cầu cung cấp kết quả giám sát'),msg(1,0,'Cung cấp kết quả giám sát và báo cáo vi phạm'),opt('Có vi phạm cần xem xét',[msg(0,2,'Trình bằng chứng và đề nghị xử lý vi phạm'),msg(2,2,'Xem xét và quyết định xử lý theo quy chế'),msg(2,0,'Cung cấp quyết định xử lý'),msg(0,3,'Yêu cầu áp dụng quyết định điều chỉnh'),msg(3,0,'Xác nhận kết quả sau điều chỉnh')]),msg(0,0,'Ghi nhận kết quả thi đấu của các đội'),msg(0,4,'Cập nhật kết quả và thứ hạng hiện tại'),msg(0,5,'Công bố kết quả theo quyền truy cập')]),
'Xử lí khiếu nại':([T,H,C,B],[msg(0,1,'Gửi khiếu nại và bằng chứng liên quan'),msg(1,2,'Tiếp nhận và chuyển khiếu nại'),msg(2,2,'Phân loại và đánh giá khiếu nại theo quy định'),alt(('Thuộc thẩm quyền xử lý được giao',[msg(2,2,'Xem xét bằng chứng và giải quyết khiếu nại'),msg(2,1,'Cung cấp kết luận và biện pháp xử lý')]),('Cần ban tổ chức xét duyệt',[msg(2,3,'Trình khiếu nại và bằng chứng để xét duyệt'),msg(3,3,'Xem xét và quyết định giải quyết'),msg(3,1,'Cung cấp quyết định giải quyết khiếu nại')])),opt('Kết luận yêu cầu điều chỉnh kết quả',[msg(1,1,'Áp dụng điều chỉnh theo quyết định có thẩm quyền')]),msg(1,0,'Thông báo kết luận và kết quả xử lý'),msg(1,1,'Ghi nhận việc giải quyết khiếu nại')]),
'Tổng hợp và đánh giá xếp loại':([T,H,B,Z],[opt('Quy chế yêu cầu nộp bài giải hoặc báo cáo',[msg(0,1,'Nộp bài giải hoặc báo cáo sau thi'),msg(1,1,'Tiếp nhận và ghi nhận bài nộp'),msg(1,0,'Xác nhận tiếp nhận bài nộp')]),msg(2,1,'Yêu cầu tổng hợp kết quả cuối cuộc thi'),msg(1,1,'Tổng hợp điểm và quyết định xử lý liên quan'),msg(1,2,'Cung cấp kết quả và bài nộp nếu có'),msg(2,2,'Đánh giá, xếp loại và xác nhận kết quả theo quy chế'),msg(2,1,'Phê duyệt kết quả cuối cuộc thi'),msg(1,3,'Cập nhật bảng xếp hạng chính thức'),msg(1,0,'Công bố kết quả cuối cuộc thi')])}

def rebuild(inter, names, steps):
    diagram=next(d for d in inter['ownedElements'] if d['_type']=='UMLSequenceDiagram')
    iid,did=inter['_id'],diagram['_id']
    inter['name']=inter['name'].strip(); diagram['name']=inter['name']
    inter['participants']=[];inter['messages']=[];inter['fragments']=[]
    views=[]; diagram['ownedViews']=views
    xs=[280+i*540 for i in range(len(names))]; width=xs[-1]+280
    frame=obj('UMLFrameView',did,left=30,top=20,width=width,height=500,font='Arial;13;0',parentStyle=False,model=ref(did))
    fl=label(frame['_id'],inter['name'],85,25,width-100);ft=label(frame['_id'],'sd',40,25,30,True)
    frame.update(subViews=[fl,ft],nameLabel=ref(fl['_id']),frameTypeLabel=ref(ft['_id'])); views.append(frame)
    lines=[];lifeviews=[]
    for name,x in zip(names,xs):
        life=obj('UMLLifeline',iid,name=name,isMultiInstance=False);inter['participants'].append(life)
        lv=obj('UMLSeqLifelineView',did,model=ref(life['_id']),left=x-180,top=65,width=360,height=500,font='Arial;13;0',parentStyle=False)
        comp=obj('UMLNameCompartmentView',lv['_id'],model=ref(life['_id']),left=x-180,top=65,width=360,height=45,font='Arial;13;0',parentStyle=True)
        labs=[label(comp['_id'],'',x-175,72),label(comp['_id'],name,x-175,79,350,True),label(comp['_id'],'',x-175,72),label(comp['_id'],'',x-175,72)]
        for j in (0,2,3):labs[j]['visible']=False
        comp.update(subViews=labs,**{k:ref(v['_id']) for k,v in zip(['stereotypeLabel','nameLabel','namespaceLabel','propertyLabel'],labs)})
        line=obj('UMLLinePartView',lv['_id'],model=ref(life['_id']),left=x,top=110,width=1,height=500,font='Arial;13;0',parentStyle=False)
        lv.update(subViews=[comp,line],nameCompartment=ref(comp['_id']),linePart=ref(line['_id']));views.append(lv);lines.append(line);lifeviews.append(lv)
    counter=0
    def emit(seq,y):
        nonlocal counter
        for item in seq:
            if item[0] in ('alt','opt'):
                typ,branches=item; start=y
                frag=obj('UMLCombinedFragment',iid,name='',interactionOperator=typ,operands=[]);inter['fragments'].append(frag)
                fv=obj('UMLCombinedFragmentView',did,model=ref(frag['_id']),left=70,top=y,width=width-80,height=100,font='Arial;13;0',parentStyle=False)
                nl=label(fv['_id'],'',125,y+5);tl=label(fv['_id'],typ,75,y+5,40,True)
                cv=obj('UMLInteractionOperandCompartmentView',fv['_id'],model=ref(frag['_id']),left=70,top=y+25,width=width-80,height=100,font='Arial;13;0',parentStyle=True,subViews=[])
                fv.update(subViews=[nl,tl,cv],nameLabel=ref(nl['_id']),frameTypeLabel=ref(tl['_id']),operandCompartment=ref(cv['_id']));views.append(fv)
                y+=30
                for guard,body in branches:
                    op=obj('UMLInteractionOperand',frag['_id'],name=guard,guard=guard);frag['operands'].append(op)
                    ov=obj('UMLInteractionOperandView',cv['_id'],model=ref(op['_id']),left=70,top=y,width=width-80,height=100,font='Arial;13;0',parentStyle=True)
                    gl=label(ov['_id'],'['+guard+']',90,y+8,width-120);ov.update(subViews=[gl],guardLabel=ref(gl['_id']));cv['subViews'].append(ov)
                    end=emit(body,y+64);ov['height']=end-y+10;y=end+10
                cv['height']=y-start-30;fv['height']=y-start;y+=35
            else:
                a,b,text=item;counter+=1
                mm=obj('UMLMessage',iid,name=text,source=ref(inter['participants'][a]['_id']),target=ref(inter['participants'][b]['_id']))
                inter['messages'].append(mm)
                mv=obj('UMLSeqMessageView',did,model=ref(mm['_id']),font='Arial;13;0',parentStyle=False,head=ref(lines[b]['_id']),tail=ref(lines[a]['_id']))
                xa,xb=xs[a],xs[b]
                if a==b: points=f'{xa}:{y};{xa+360}:{y};{xa+360}:{y+24};{xa}:{y+24}';lx=xa+20;ly=y-21;lw=350
                else: points=f'{xa}:{y};{xb}:{y}';lw=min(abs(xb-xa)-30,len(text)*7+45);lx=(xa+xb-lw)/2;ly=y-23
                labs=[]
                for j in range(3):
                    l=obj('EdgeLabelView',mv['_id'],model=ref(mm['_id']),font='Arial;13;0',parentStyle=False,left=lx,top=ly,width=lw,height=16,alpha=1.5707963267948966,distance=12,hostEdge=ref(mv['_id']),edgePosition=1)
                    if j==0:l['text']=f'{counter} : {text}'
                    else:l['visible']=False
                    labs.append(l)
                ac=obj('UMLActivationView',mv['_id'],model=ref(mm['_id']),left=xb-7,top=y,width=14,height=28,font='Arial;13;0',parentStyle=False,visible=False)
                mv.update(points=points,subViews=labs+[ac],nameLabel=ref(labs[0]['_id']),stereotypeLabel=ref(labs[1]['_id']),propertyLabel=ref(labs[2]['_id']),activation=ref(ac['_id']),showSequenceNumber=True)
                views.append(mv);y+=80
        return y
    end=emit(steps,160)+30
    frame['height']=end
    for lv,line in zip(lifeviews,lines):lv['height']=end-65;line['height']=end-110

changed=[]
for inter in list(nodes(model)):
    if inter.get('_type')=='UMLInteraction' and inter.get('name','').strip() in spec:
        name=inter['name'].strip();rebuild(inter,*spec[name]);changed.append(name)
assert len(changed)==12
# Validate every generated reference, unique IDs, endpoints and unchanged excluded diagrams.
ids=[n['_id'] for n in nodes(model) if '_id' in n]
assert len(ids)==len(set(ids)), 'Duplicate IDs'
allids=set(ids)
oldids={n['_id'] for n in nodes(original) if '_id' in n}
oldmissing={n['$ref'] for n in nodes(original) if '$ref' in n and n['$ref'] not in oldids}
missing={n['$ref'] for n in nodes(model) if '$ref' in n and n['$ref'] not in allids}
assert missing<=oldmissing, f'New dangling references: {missing-oldmissing}'
for name in ('2TEAM ROUND 1','2TEAM ROUND 2'):
    before=[n for n in nodes(original) if n.get('_type')=='UMLInteraction' and n.get('name','').strip()==name]
    after=[n for n in nodes(model) if n.get('_type')=='UMLInteraction' and n.get('name','').strip()==name]
    assert before==after
OUT.write_text(json.dumps(model,ensure_ascii=False,indent=2),encoding='utf-8')
assert json.loads(OUT.read_text(encoding='utf-8'))==model
report=['# Các Sequence đã sửa ở mức quan niệm','', 'Giữ nguyên 2TEAM ROUND 1 và 2TEAM ROUND 2. Công thức điểm phụ thuộc quy chế; nộp bài giải là nhánh có điều kiện.','']
def explain(seq,indent=''):
    for item in seq:
        if item[0] in ('alt','opt'):
            for guard,body in item[1]:
                yield indent+'- ['+guard+']'
                yield from explain(body,indent+'  ')
        else:yield indent+f'- {item[2]}'
for name,(participants,steps) in spec.items():report+=['## '+name,'',' → '.join(participants),'',*explain(steps),'']
report+=['## Kiểm tra cấu trúc','','- 12 sơ đồ được sửa; hai sơ đồ loại trừ giữ nguyên toàn bộ mô hình và bố cục.','- Không có ID trùng và không phát sinh tham chiếu không tồn tại.','- File đã được đọc lại thành công sau khi ghi.','- Chưa kiểm chứng bằng cách mở trong ứng dụng StarUML.']
(ROOT/'artifacts'/'reports'/'sequence-edit-report.md').write_text('\n'.join(report),encoding='utf-8')
print(json.dumps({'output':str(OUT),'changed':changed,'existing_missing_references':len(oldmissing),'source_sha256':hashlib.sha256(raw).hexdigest()},ensure_ascii=False))
