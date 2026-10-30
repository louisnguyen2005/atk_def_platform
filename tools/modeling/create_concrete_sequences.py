"""Create an independent, concrete competition scenario without changing the source."""
import ast
import copy
import hashlib
import json
import pathlib
import uuid
from PIL import ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
SOURCE = pathlib.Path(r'C:\Users\Nguyen Thanh Dat\Documents\AN TOAN THONG TIN\LUAN VAN TOT NGHIEP ATTT\WEEKLY REPORT\WEEK 7\MEKODATACTF CU THE.mdj')
OUT = ROOT / 'models' / 'mekodatactf' / 'MEKODATACTF CU THE.mdj'
raw = SOURCE.read_bytes()
model = json.loads(raw.decode('utf-8-sig'))
original = copy.deepcopy(model)

# Reuse the model/view builder only; never execute the earlier script's file writes.
tree = ast.parse((ROOT / 'tools' / 'modeling' / 'fix_sequences.py').read_text(encoding='utf-8'))
functions = ast.Module(body=[x for x in tree.body if isinstance(x, ast.FunctionDef)], type_ignores=[])
code = ast.unparse(functions)
code = code.replace('280 + i * 540', '300 + i * 600')
code = code.replace('width = xs[-1] + 280', 'width = xs[-1] + 650')
code = code.replace('xa + 360', 'xa + 510').replace('lw = 350', 'lw = 510')
code = code.replace('a, b, text = item', 'a, b, text = item[:3]')
code = code.replace("inter['messages'].append(mm)", "\n                if len(item) > 3 and item[3]: mm['messageSort'] = 'reply'\n                inter['messages'].append(mm)")
exec(compile(code, '<sequence-builder>', 'exec'), globals())

def m(a,b,text): return (a,b,text,False)
def r(a,b,text): return (a,b,text,True)
def loop(guard,steps): return ('loop',[(guard,steps)])
# Allow loop fragments with exactly the same geometry as opt/alt.
src=code.replace("('alt', 'opt')", "('alt', 'opt', 'loop')")
exec(compile(src, '<sequence-builder>', 'exec'), globals())

B='Ban tổ chức';H='Hệ thống cuộc thi';T='Team01 / Team02';A='Quản lý tài khoản';R='Quản lý tài nguyên';E='Môi trường Team02';K='Kiểm tra dịch vụ';P='Bộ tính điểm';Z='Bảng xếp hạng';X='Xác thực cờ';Q='Quản lý đề thi';S='Bộ phận kỹ thuật';C='Xử lý khiếu nại';V='Giám sát cuộc thi'

from scoring_scenarios import RULES, spec

# These are concrete traces: first the successful members/team, then the failed
# member/team and its recovery. Both events occurred in this illustrative trace.
for name in ('Tạo tài khoản','Kiểm tra đăng nhập'):
    steps=spec[name][2]
    expanded=[]
    for step in steps:
        if step[0]=='alt':
            for guard,body in step[1]:expanded.extend(body)
        else:expanded.append(step)
    steps[:]=expanded
font=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',13)
def add_note(diagram,text):
    # StarUML's built-in free note view, deliberately without a model reference.
    note=obj('UMLNoteView',diagram['_id'],left=75,top=140,width=diagram['ownedViews'][0]['width']-140,height=100,
             font='Arial;13;0',parentStyle=False,text=text,wordWrap=True)
    diagram['ownedViews'].append(note)

changed=[]
for inter in list(nodes(model)):
    name=inter.get('name','').strip()
    if inter.get('_type')!='UMLInteraction' or name not in spec:continue
    names,context,steps=spec[name]
    rebuild(inter,names,steps)
    inter['documentation']='Tình huống giả định trong một cuộc thi minh họa. '+context+'\n\n'+RULES
    dia=next(d for d in inter['ownedElements'] if d['_type']=='UMLSequenceDiagram')
    dia['showSequenceNumber']=True
    dia['showActivation']=False
    # Reserve the area under participant headers for the readable scenario note.
    for v in nodes(dia['ownedViews']):
        typ=v.get('_type','')
        if typ=='UMLFrameView':v['height']+=130
        elif typ=='UMLSeqLifelineView':v['height']+=130
        elif typ=='UMLLinePartView':v['height']+=130
        elif 'top' in v and v['top']>=130:v['top']+=130
        if 'points' in v:
            v['points']=';'.join(f'{float(p.split(":")[0]):g}:{float(p.split(":")[1])+130:g}' for p in v['points'].split(';'))
    add_note(dia,'TÌNH HUỐNG GIẢ ĐỊNH — '+context)
    # Use actual font metrics for label geometry; keep text within the diagram.
    for view in nodes(dia):
        if view.get('_type')=='EdgeLabelView' and view.get('visible',True) and view.get('text'):
            view['width']=float(font.getlength(view['text']))+6
            edge=next(v for v in dia['ownedViews'] if v.get('_id')==view['hostEdge']['$ref'])
            pts=[tuple(map(float,p.split(':'))) for p in edge['points'].split(';')]
            if len(pts)==2:view['left']=(pts[0][0]+pts[1][0]-view['width'])/2
            else:view['left']=pts[0][0]+18
    changed.append(name)

model['name']='MEKODATACTF CU THE'
model['documentation']=RULES
# A visible overview makes the rule assumptions available without opening documentation.
collab=next(n for n in nodes(model) if n.get('_type')=='UMLCollaboration')
referenced={n['$ref'] for n in nodes(model) if '$ref' in n}
collab['attributes']=[a for a in collab.get('attributes',[]) if a['_id'] in referenced]
overview=obj('UMLClassDiagram',collab['_id'],name='00 - Bối cảnh và quy tắc kịch bản',defaultDiagram=True,ownedViews=[])
overview['ownedViews'].append(obj('UMLNoteView',overview['_id'],left=40,top=40,width=1050,height=700,font='Arial;15;0',parentStyle=False,text=RULES,wordWrap=True))
collab['ownedElements']=[d for d in collab['ownedElements'] if d.get('name') != '00 - Bối cảnh và quy tắc kịch bản']
collab['ownedElements'].insert(0,overview)

assert len(changed)==12
ids=[n['_id'] for n in nodes(model) if '_id' in n]
assert len(ids)==len(set(ids))
allids=set(ids)
assert not [n['$ref'] for n in nodes(model) if '$ref' in n and n['$ref'] not in allids]
for name in ('2TEAM ROUND 1','2TEAM ROUND 2'):
    pick=lambda data:[n for n in nodes(data) if n.get('_type')=='UMLInteraction' and n.get('name','').strip()==name]
    assert pick(model)==pick(original)
for inter in nodes(model):
    if inter.get('_type')=='UMLInteraction' and inter.get('name') in spec:
        participants={p['_id'] for p in inter['participants']}
        for mm in inter['messages']:
            assert mm['source']['$ref'] in participants and mm['target']['$ref'] in participants
assert 6+(10-3)+2==15
from decimal import Decimal
assert Decimal(3+10-6)+Decimal(2)-Decimal("0.2")==Decimal("8.8")
OUT.write_text(json.dumps(model,ensure_ascii=False,indent=2),encoding='utf-8')
assert json.loads(OUT.read_text(encoding='utf-8'))==model
assert SOURCE.read_bytes()==raw

report=['# MEKODATACTF — Kịch bản cụ thể','',RULES]
for name,(people,context,steps) in spec.items():
    report+=['## '+name,'',context,'']
    def explain(seq):
        for item in seq:
            if item[0] in ('alt','opt','loop'):
                for guard,body in item[1]:
                    yield '**'+guard+'**'
                    yield from explain(body)
            else:yield f'- {people[item[0]]} → {people[item[1]]}: {item[2]}'
    report+=list(explain(steps))+['']
(ROOT/'artifacts'/'reports'/'scenario-concrete.md').write_text('\n'.join(report),encoding='utf-8')
print(json.dumps({'output':str(OUT),'source_sha256':hashlib.sha256(raw).hexdigest(),'modified_sequences':len(changed),'messages':sum(len(i['messages']) for i in nodes(model) if i.get('_type')=='UMLInteraction' and i.get('name') in spec)},ensure_ascii=False))
