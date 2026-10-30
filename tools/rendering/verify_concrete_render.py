import json,urllib.request,base64,pathlib
from PIL import Image,ImageDraw,ImageFont
root=pathlib.Path(__file__).resolve().parents[2]; out=root/'artifacts'/'previews'/'concrete-preview';out.mkdir(parents=True,exist_ok=True)
def call(path,data):
    req=urllib.request.Request('http://127.0.0.1:58321/'+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})
    result=json.load(urllib.request.urlopen(req,timeout=30))
    assert result.get('success'),result
    return result['data']
diagrams=call('get_all_diagrams_info',{})
project=json.loads((root/'models'/'mekodatactf'/'MEKODATACTF CU THE.mdj').read_text(encoding='utf-8'))
def nodes(x):
    if isinstance(x,dict):
        yield x
        for v in x.values():yield from nodes(v)
    elif isinstance(x,list):
        for v in x:yield from nodes(v)
overview=next(n['_id'] for n in nodes(project) if n.get('name')=='00 - Bối cảnh và quy tắc kịch bản')
assert any(d['id']==overview for d in diagrams),'API is not on final project'
images=[]
for d in diagrams:
    if d['type']!='UMLSequenceDiagram' or d['name'].startswith('2TEAM'):continue
    data=call('get_diagram_image_by_id',{'diagramId':d['id']})
    assert isinstance(data,str) and len(data)>100
    if data.startswith('data:'):data=data.split(',',1)[1]
    p=out/(d['name']+'.png');p.write_bytes(base64.b64decode(data))
    im=Image.open(p).convert('RGB');assert im.width>300 and im.height>300
    images.append((d['name'],im));print(d['name'],im.size)
font=ImageFont.truetype(r'C:\Windows\Fonts\arial.ttf',21)
for start in range(0,len(images),4):
    sheet=Image.new('RGB',(1800,1500),'#d5d9df');draw=ImageDraw.Draw(sheet)
    for j,(name,im) in enumerate(images[start:start+4]):
        x=(j%2)*900;y=(j//2)*750
        draw.text((x+15,y+8),name,font=font,fill='black')
        im.thumbnail((880,700));sheet.paste(im,(x+10,y+40))
    sheet.save(out/f'contact-{start//4+1}.png')
assert len(images)==12
print('12 diagrams rendered successfully through installed StarUML API.')
