"""Compile the approved DOCX sources. IDs below are permanent, never regenerate from prose."""
import argparse, hashlib, json, re
from pathlib import Path
from datetime import date, timedelta
from docx import Document

# Source order is only a compiler mapping; these semantic keys survive renumbering.
IDENTITIES = [
 ('sentences', 'declarative yesno wh rhetorical negation conditional topic command modal'),
 ('modification', 'manner aspect degree'), ('connections', 'list contrast coordination'),
 ('time', 'frame frequency relationships'), ('manual', 'cardinal fingerspelling'),
 ('lexicalized', ''), ('formation', 'compound nounverb numeral'), ('variety', ''),
 ('depicting', 'shape entity handling bodypart'), ('enactment', 'character roleshift'),
 ('spatial', 'layout referent directional'), ('conversation', 'turns repair'),
 ('nonmanual', 'signs modification grammar discourse'), ('message', ''),
 ('history', 'figures events education rights'),
 ('culture', 'norms values identities technology visual expression media')]

def template(p):
    parts=[]
    for r in p.runs:
        if not r.text: continue
        slot=bool(r.underline)
        if parts and parts[-1]['slot']==slot: parts[-1]['text']+=r.text
        else: parts.append({'text':r.text,'slot':slot})
    return parts

def compile_course(path, level):
    manifest=json.loads(Path(__file__).with_name('competency-identities.json').read_text(encoding='utf-8'))
    ps=Document(path).paragraphs
    starts=[i for i,p in enumerate(ps[:-1]) if re.match(r'^\d+\. ',p.text) and ps[i+1].text.startswith('Competency:')]
    appendix=next(i for i,p in enumerate(ps) if p.text.strip()=='Communication Modes')
    identities=[x for x in IDENTITIES if level>1 or x[0]!='message']
    assert len(starts)==len(identities)
    out=[]
    for n,start in enumerate(starts):
        title=re.sub(r'^\d+\. ','',ps[start].text)
        # Renumbering/reordering is safe. A title/label edit requires an explicit
        # manifest alias retaining its original key, rather than inventing a new ID.
        identity=manifest[title]
        key=identity['key']
        section=ps[start:(starts[n+1] if n+1<len(starts) else appendix)]
        required=next((i for i,p in enumerate(section) if p.text.strip()=='Required Elements'),None)
        scale=next(i for i,p in enumerate(section) if p.text.strip()=='Proficiency Scale')
        elements=[]
        if required is not None:
            for p in section[required+1:scale]:
                if not p.text.strip(): continue
                if p.style.name=='List Bullet': elements.append({'label':p.text,'notes':[]})
                elif elements: elements[-1]['notes'].append(p.text)
        assert len(identity['elements'])==len(elements),(key,elements)
        for e in elements:
            e['key']=identity['elements'][e['label']]
            e['replacement']=e['label'] if e['label'].startswith(('WH-','ASL ')) else e['label'][:1].lower()+e['label'][1:]
        rubrics={}
        for p in section[scale+1:]:
            m=re.match(r'^([1-4])\. ',p.text)
            if m:
                parts=template(p); parts[0]['text']=re.sub(r'^[1-4]\. ','',parts[0]['text'])
                rubrics[m[1]]=parts
        text=template(section[1]); text[0]['text']=text[0]['text'].removeprefix('Competency:').lstrip()
        out.append({'key':key,'number':n+1,'title':re.sub(r'^\d+\. ','',section[0].text),
            'text':text,'notes':[p.text for p in section[2:required if required is not None else scale] if p.text.strip()],
            'elements':elements,'rubric':rubrics,'modes':['single'] if key in ['conversation','history','culture'] else ['expression','reception']})
    return {'level':level,'source':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
            'competencies':out,'mode_notes':[p.text for p in ps[appendix:] if p.text.strip()]}

def main():
    a=argparse.ArgumentParser(); a.add_argument('source',type=Path); args=a.parse_args()
    courses=[compile_course(args.source/f'Proficiency list for asl {i}.docx',i) for i in [1,2,3]]
    closed={'2026-10-12','2026-11-11','2026-11-26','2026-11-27','2027-01-18','2027-02-12','2027-02-15','2027-05-31'}
    days=[]; d=date(2026,9,14)
    while d<=date(2027,6,10):
        iso=d.isoformat(); holiday=iso in closed or '2026-12-21'<=iso<='2027-01-01' or '2027-04-05'<=iso<='2027-04-09'
        days.append({'date':iso,'instructional':d.weekday()<5 and not holiday,'label':'No school' if holiday else None}); d+=timedelta(days=1)
    assert sum(d['instructional'] for d in days)==171
    bundle={'version':'competencies-2026-v1','courses':courses,'calendar':{'school_year':'2026-2027','timezone':'America/Los_Angeles','days':days},
            'calendar_note':'User-selected September 14–June 10 planning window with published breaks; final official last day remains unconfirmed.'}
    dest=Path(__file__).resolve().parents[1]/'data'/'competencies-2026.json'
    dest.write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Compiled',dest)

if __name__=='__main__': main()
