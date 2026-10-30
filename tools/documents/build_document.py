from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]
from docx import Document
from docx.shared import Pt
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn
import pdfplumber,re
from pypdf import PdfReader
from PIL import Image
D=Document(); sec=D.sections[0]; sec.page_width=Pt(612);sec.page_height=Pt(792);sec.top_margin=Pt(35);sec.bottom_margin=Pt(36);sec.left_margin=Pt(90);sec.right_margin=Pt(72)
s=D.styles['Normal'];s.font.name='Times New Roman';s.font.size=Pt(12);s.paragraph_format.space_after=Pt(0);s.paragraph_format.line_spacing=Pt(20.75)
N=D.part.numbering_part.element
counter=20
def el(tag,**attrs):
 x=OxmlElement('w:'+tag)
 for k,v in attrs.items():x.set(qn('w:'+k),str(v))
 return x
# Real picture bullet matching the original multicolour symbol.
r=PdfReader(r'C:\Users\Nguyen Thanh Dat\Documents\ANH PHỤNG\Thuc hanh 2-Bullet-Numbering.pdf')
im=list(r.pages[0].images)[0];(ROOT/'assets'/'references'/'bullet.png').write_bytes(im.data)
rid,img=D.part.get_or_add_image(str(ROOT/'assets'/'references'/'bullet.png'))
pic=el('numPicBullet',numPicBulletId=0)
pic.append(parse_xml('''<w:pict xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><v:shape id="_x0000_i1025" style="width:9.95pt;height:9.95pt"><v:imagedata r:id="%s"/></v:shape></w:pict>'''%rid))
# relationship belongs to numbering part
from docx.opc.constants import RELATIONSHIP_TYPE as RT
nrid=D.part.numbering_part.relate_to(D.part.related_parts[rid],RT.IMAGE)

for x in pic.iter():
 if x.get(qn('r:id')):x.set(qn('r:id'),nrid)
# omit
def definition(formats,texts,start=1,bullet=False):
 global counter
 counter+=1; aid=counter; a=el('abstractNum',abstractNumId=aid);a.append(el('multiLevelType',val='multilevel'))
 for i,(f,t) in enumerate(zip(formats,texts)):
  l=el('lvl',ilvl=i);l.append(el('start',val=start if i==0 else 1));l.append(el('numFmt',val=f));l.append(el('lvlText',val=t));l.append(el('lvlJc',val='left'))
  pp=el('pPr'); pp.append(el('ind',left=1080+i*720,hanging=360));l.append(pp)
  rp=el('rPr');rp.append(el('rFonts',ascii=({'':'Symbol','':'Symbol','':'Webdings','':'Webdings','':'Webdings'}.get(t,'Wingdings')) if f=='bullet' else 'Times New Roman',hAnsi=({'':'Symbol','':'Symbol','':'Webdings','':'Webdings','':'Webdings'}.get(t,'Wingdings')) if f=='bullet' else 'Times New Roman'));l.append(rp)
  a.append(l)
 N.append(a);n=el('num',numId=aid);n.append(el('abstractNumId',val=aid));N.append(n);return aid,a
base,a=definition(['upperRoman','decimal','decimal','decimal'],['%1.','%2.','%2.%3.','%2.%3.%4.'])
second,_=definition(['upperRoman','lowerLetter','bullet'],['%1.','%2)','\uf02d'],2)
third,_=definition(['upperRoman','lowerLetter','decimal'],['%1.','%2.','%2.%3.'],3)
cache={}
pdf=pdfplumber.open(r'C:\Users\Nguyen Thanh Dat\Documents\ANH PHỤNG\Thuc hanh 2-Bullet-Numbering.pdf')
part='A';root=1;prev=None;total=0
for pi,page in enumerate(pdf.pages):
 words=page.extract_words();groups=[]
 for w in words:
  if not groups or abs(w['top']-groups[-1][0]['top'])>3:groups.append([w])
  else:groups[-1].append(w)
 for row in groups:
  txt=' '.join(w['text'] for w in row)
  if 'Danh sách' in txt:
   part=txt[0];p=D.add_paragraph();p.paragraph_format.left_indent=Pt(0);p.add_run(txt).bold=True
  elif 'Cấp' in txt:
   cw=next(w for w in row if w['text']=='Cấp');suffix=' '.join(w['text'] for w in row[row.index(cw):]);label=suffix.split()[-1];level=label.count('.'); root=int(label.split('.')[0]);p=D.add_paragraph();p.add_run(suffix).bold=(level==0)
   if part=='B':num={1:base,2:second,3:third}[root]
   else:
    glyph=next((c['text'] for c in page.chars if abs(c['top']-cw['top'])<3 and c['x0']<cw['x0'] and ord(c['text'][0])>=0xf000),None)
    if label in ['1.2.1.1','1.2.1.2']:glyph='PIC'
    # alphabetic sublist under Cấp 3
    fmt='lowerLetter' if root==3 and level==1 else 'bullet'
    glyph='%2.' if fmt=='lowerLetter' else glyph or '\uf0b7'
    key=(level,glyph)
    if key not in cache:
     fs=['bullet']*4;ts=['\uf076','\uf0d8','\uf0fc','\uf0b7'];fs[level]=fmt;ts[level]=glyph if glyph!='PIC' else ''
     nn,aa=definition(fs,ts)
     if glyph=='PIC':pass
     cache[key]=nn
    num=cache[key]
   np=el('numPr');np.append(el('ilvl',val=level));np.append(el('numId',val=num));p._p.get_or_add_pPr().append(np)
   p.paragraph_format.left_indent=Pt(cw['x0']-90);p.paragraph_format.first_line_indent=Pt(-18 if part=='A' else -max(18,cw['x0']-min(w['x0'] for w in row)))
   if part=='A' and label in ['1.2.1.1','1.2.1.2']:
    p.clear();p.paragraph_format.left_indent=Pt(cw['x0']-90-18);p.paragraph_format.first_line_indent=Pt(0)
    p.paragraph_format.tab_stops.add_tab_stop(Pt(cw['x0']-90))
    p.add_run().add_picture(str(ROOT/'assets'/'references'/'bullet.png'),width=Pt(9.95),height=Pt(9.95));p.add_run('\t'+suffix)
   if pi==1 and prev!=1:p.paragraph_format.page_break_before=True
   total+=1
  else:continue
  prev=pi
for lv in N.iter(qn('w:lvl')):
 picid=lv.find(qn('w:lvlPicBulletId'))
 if picid is not None:
  lv.remove(picid);lv.insert(4,picid)
order={'numPicBullet':0,'abstractNum':1,'num':2,'numIdMacAtCleanup':3}
for node in sorted(list(N),key=lambda n:order.get(n.tag.split('}')[-1],4)):
 N.remove(node);N.append(node)
(ROOT/'artifacts'/'documents').mkdir(parents=True,exist_ok=True)
D.save(ROOT/'artifacts'/'documents'/'Thuc hanh 2-Bullet-Numbering.docx')
print('Saved',total,'real list paragraphs')



