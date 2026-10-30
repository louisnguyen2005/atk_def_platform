from pathlib import Path
p=Path(__file__).with_name('build_document.py');s=p.read_text(encoding='utf-8-sig');s=s.replace("'Wingdings' if f=='bullet' else 'Times New Roman'","({'\uf02d':'Symbol','\uf0b7':'Symbol','\uf080':'Webdings','\uf0af':'Webdings','\uf0ff':'Webdings'}.get(t,'Wingdings')) if f=='bullet' else 'Times New Roman'");p.write_text(s,encoding='utf-8')
