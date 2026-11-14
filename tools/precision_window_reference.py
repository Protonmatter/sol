"""Offline admission of the owner-approved 1900–2200 reference sweep."""
from __future__ import annotations

from collections.abc import Mapping
import csv
from dataclasses import dataclass
import datetime as dt
import hashlib
import io
import json
import math
from pathlib import Path
import re
from types import MappingProxyType
import urllib.parse

from horizons_reference import ENDPOINT, _file, _keys, _reject_constant, _unique, _utc

PLAN_SHA256 = 'e18f2b66cb60fd06d4f8a9ed15c4ddc0b44a28602af803bb204be5d81e4ab8c1'
VECTOR_CASES = (('mercury','Mercury',199,10),('venus','Venus',299,10),('earth','Earth',399,10),
    ('mars','Mars',4,10),('jupiter','Jupiter',5,10),('saturn','Saturn',6,10),('uranus','Uranus',7,10),
    ('neptune','Neptune',8,10),('moon','Moon',301,10),('geocentric-moon','GeocentricMoon',301,399))
APPARENT_CASES = (('sun','Sun',10,399),('moon','Moon',301,399),('mercury','Mercury',199,399),
    ('venus','Venus',299,399),('mars','Mars',4,399),('jupiter','Jupiter',5,399),('saturn','Saturn',6,399),
    ('uranus','Uranus',7,399),('neptune','Neptune',8,399))
MODEL_START = dt.date(1899,12,31).toordinal()+1721424.5
MODEL_END = dt.date(2201,1,2).toordinal()+1721424.5
TARGET_START = dt.date(1900,1,1).toordinal()+1721424.5
TARGET_END = dt.date(2201,1,1).toordinal()+1721424.5
GRID = tuple(MODEL_START+30*i for i in range(int((MODEL_END-MODEL_START)//30)+1))
_NUMBER = re.compile(r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?')
MONTHS = ('Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec')
ACCEPTANCE = {'vector_metric':'relative_vector_norm_arcsec','vector_maximum':10.0,
    'pointing_metric':'great_circle_arcsec','sun_planet_arcsec':10.0,'moon_arcsec':12.0,
    'range_metric':'absolute_km','range_floor_km':1.0,'range_relative':1e-5}
METADATA = {'plan':'predeclared-plan.txt','initial_spec':'query-spec.json','initial_builder':'query-builder.py.txt',
    'initial_progress':'initial-progress.json','amendment':'transport-amendment.json',
    'query_spec':'query-spec-32.json','query_builder':'query-builder-32.py.txt','acquisition':'acquisition.json'}


def irregular_epochs() -> tuple[float, ...]:
    result = set(); state = 0x534F4C32
    span = int((TARGET_END-TARGET_START)*86400)
    while len(result) < 257:
        state = (1664525*state+1013904223) % (2**32)
        jd = float(f'{TARGET_START+(state*span//(2**32))/86400:.9f}')
        if jd not in GRID:
            result.add(jd)
    result.update((TARGET_START,TARGET_END,MODEL_END))
    return tuple(sorted(result))


IRREGULAR = irregular_epochs()
EPOCHS = tuple(sorted(set(GRID) | set(IRREGULAR)))


def batches(limit: int = 32) -> tuple[dict, ...]:
    if limit not in (32,64):
        raise ValueError('unsupported declared batch limit')
    return ({'id':'grid','epochs_jd':list(GRID)}, *({'id':f'irregular-{i//limit}',
        'epochs_jd':list(IRREGULAR[i:i+limit])} for i in range(0,len(IRREGULAR),limit)))


def queries(limit: int = 32) -> list[dict]:
    result = []
    for kind,cases in [('vectors',VECTOR_CASES),('apparent',APPARENT_CASES)]:
        for case,body,target,center in cases:
            for batch in batches(limit):
                params = {'format':'text','COMMAND':f"'{target}'",'OBJ_DATA':"'NO'",'MAKE_EPHEM':"'YES'",
                    'EPHEM_TYPE':"'VECTORS'" if kind=='vectors' else "'OBSERVER'",'CENTER':f"'500@{center}'"}
                if batch['id']=='grid':
                    params.update(START_TIME=f"'JD{MODEL_START:.9f}'",STOP_TIME=f"'JD{MODEL_END:.9f}'",STEP_SIZE="'30 d'")
                else:
                    params.update(TLIST=' '.join(f"'{jd:.9f}'" for jd in batch['epochs_jd']),TLIST_TYPE="'JD'")
                params.update(TIME_TYPE="'TDB'" if kind=='vectors' else "'TT'",CAL_TYPE="'GREGORIAN'",
                    TIME_DIGITS="'FRACSEC'",REF_SYSTEM="'ICRF'",CSV_FORMAT="'YES'")
                if kind=='vectors':
                    params.update(REF_PLANE="'ECLIPTIC'",VEC_CORR="'NONE'",OUT_UNITS="'AU-D'",VEC_TABLE="'1'",VEC_LABELS="'YES'")
                else:
                    params.update(CAL_FORMAT="'JD'",QUANTITIES="'2,20,30,45'",ANG_FORMAT="'DEG'",APPARENT="'AIRLESS'",EXTRA_PREC="'YES'",ELEV_CUT="'-90'")
                result.append({'kind':kind,'case':case,'body':body,'target':target,'center':center,'batch':batch['id'],
                    'request_url':ENDPOINT+'?'+urllib.parse.urlencode(params,quote_via=urllib.parse.quote)})
    return result


def query_spec(limit: int = 32) -> dict:
    return {'schema_version':'precision-window-query-spec.v1','target_start_jd_utc':TARGET_START,
        'target_end_jd_utc':TARGET_END,'model_start_jd':MODEL_START,'model_end_jd':MODEL_END,
        'epochs_jd':list(EPOCHS),'batches':list(batches(limit)),'queries':queries(limit)}


def _decode(raw: bytes) -> dict:
    return json.loads(raw,object_pairs_hook=_unique,parse_constant=_reject_constant)


def _same_typed(actual: object, expected: object) -> bool:
    if type(actual) is not type(expected):
        return False
    if isinstance(expected,dict):
        return set(actual)==set(expected) and all(_same_typed(actual[key],value) for key,value in expected.items())
    if isinstance(expected,list):
        return len(actual)==len(expected) and all(_same_typed(a,b) for a,b in zip(actual,expected))
    return actual==expected


_QUERIES = MappingProxyType({(query['kind'],query['case'],query['batch']):MappingProxyType(query) for query in queries()})
_BATCHES = MappingProxyType({batch['id']:tuple(batch['epochs_jd']) for batch in batches()})


def _calendar_jd(value: str) -> float:
    match = re.fullmatch(r'A\.D\. (\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}\.\d{4})',value)
    if not match or match[2] not in MONTHS:
        raise ValueError('reference calendar value differs')
    year,month,day,hour,minute,second = int(match[1]),MONTHS.index(match[2])+1,int(match[3]),int(match[4]),int(match[5]),float(match[6])
    if not (0<=hour<24 and 0<=minute<60 and 0<=second<60):
        raise ValueError('reference calendar clock differs')
    return dt.date(year,month,day).toordinal()+1721424.5+(hour*3600+minute*60+second)/86400


@dataclass(frozen=True)
class ApparentReference:
    ra_deg: float
    dec_deg: float
    range_au: float
    range_rate_km_s: float
    tdb_minus_ut_seconds: float
    icrf_ra_deg: float
    icrf_dec_deg: float


@dataclass(frozen=True)
class ReferenceEpoch:
    requested_jd: float
    requested_token: str
    returned_jd: float
    returned_token: str
    serialization_allowance_seconds: float


def parse_response(text: str, query: dict, expected_epochs: tuple[float, ...]) -> dict:
    if not isinstance(query,dict) or not isinstance(text,str):
        raise ValueError('unsupported reference descriptor')
    identity=(query.get('kind'),query.get('case'),query.get('batch'))
    if not all(isinstance(value,str) for value in identity):
        raise ValueError('unsupported reference descriptor identity')
    expected=_QUERIES.get(identity)
    if expected is None or not _same_typed(query,dict(expected)) or expected_epochs!=_BATCHES[query['batch']]:
        raise ValueError('reference descriptor differs from declared query matrix')
    kind = query['kind']
    if kind not in ('vectors','apparent') or not expected_epochs:
        raise ValueError('unsupported reference type or empty epochs')
    if not text.startswith('API VERSION: 1.2\nAPI SOURCE: NASA/JPL Horizons API\n'):
        raise ValueError('reference API source/version differs')
    for name,identity in [('Target',query['target']),('Center',query['center'])]:
        if re.findall(r'^'+name+r' body name:[^\r\n]*\((\d+)\)\s+\{source: ([^}]+)\}',text,re.M) != [(str(identity),'DE441')]:
            raise ValueError('reference target/origin/source differs')
    def header(name: str) -> str:
        values = re.findall(r'^'+re.escape(name)+r'\s*:\s*([^\r\n]+)',text,re.M)
        if len(values)!=1:
            raise ValueError('reference header unavailable/duplicated: '+name)
        return values[0].rstrip()
    common = {'Calendar mode':'Gregorian','Center-site name':'BODY CENTER' if kind=='vectors' else 'GEOCENTRIC'}
    specific = {'Output units':'AU-D','Output type':'GEOMETRIC cartesian states','Output format':'1 (position only)',
        'Reference frame':'Ecliptic of J2000.0'} if kind=='vectors' else {'Atmos refraction':'NO (AIRLESS)','RA format':'DEG','Time format':'JD'}
    for name,expected in (common|specific).items():
        if header(name)!=expected:
            raise ValueError('reference frame/units/observer/calendar differs')
    scale = 'TDB' if kind=='vectors' else 'TT'
    for name,epoch in [('Start time',MODEL_START if query['batch']=='grid' else expected_epochs[0]),
                       ('Stop  time',MODEL_END if query['batch']=='grid' else expected_epochs[-1])]:
        value = header(name)
        if not value.endswith(' '+scale) or abs(_calendar_jd(value[:-len(scale)-1])-epoch)*86400 > .001:
            raise ValueError('reference time header differs')
    if kind=='vectors':
        if re.findall(r'^\s+X-axis\s+: ([^\r\n]+)',text,re.M)!=['ICRF'] \
                or text.count('IAU76 obliquity of 84381.448 arcseconds wrt ICRF X-Y plane')!=1:
            raise ValueError('reference vector axes differ')
    elif not header('Center geodetic').startswith('0.0, 0.0, -6378.137 ') \
            or not header('Center cylindric').startswith('0.0, 0.0, 0.0 ') \
            or text.count('Units: AU and KM/S')!=1:
        raise ValueError('reference apparent center or range units differ')
    if text.count('$$SOE')!=1 or text.count('$$EOE')!=1 or text.index('$$SOE')>text.index('$$EOE'):
        raise ValueError('reference needs one ordered table')
    labels = ['JDTDB','Calendar Date (TDB)','X','Y','Z',''] if kind=='vectors' else [
        'Date_________JDTT','','','R.A.__(a-app)','DEC___(a-app)','delta','deldot','TDB-UT','RA_(ICRF-a-app)','DEC_(ICRF-a-app)','']
    try:
        found = [next(csv.reader([line],strict=True)) for line in text.splitlines()
                 if line.strip().startswith(('JDTDB,','Date_________JD'))]
        rows = list(csv.reader(io.StringIO(text.split('$$SOE',1)[1].split('$$EOE',1)[0].strip()),strict=True))
    except csv.Error as exc:
        raise ValueError('malformed reference CSV') from exc
    if [[cell.strip() for cell in row] for row in found]!=[labels] or len(rows)!=len(expected_epochs):
        raise ValueError('reference columns or epoch cardinality differs')
    result = {}
    for row,jd in zip(rows,expected_epochs):
        cells = [cell.strip() for cell in row]
        if len(cells)!=len(labels) or cells[-1] or re.fullmatch(r'\d+\.\d{9}',cells[0]) is None:
            raise ValueError('reference epoch/order/column differs')
        returned=float(cells[0])
        # Retain both tokens. Horizons' JD->calendar->JD formatting can shift a
        # printed irregular epoch by two f64 ulps. Admit only the fixed printed
        # half-quantum plus two arithmetic ulps, capped by the 1ms clock budget.
        allowance=min(.001/86400,.5e-9+2*math.ulp(jd))
        if not math.isfinite(returned) or abs(returned-jd)>allowance:
            raise ValueError('reference epoch exceeds its serialization allowance')
        epoch=ReferenceEpoch(jd,f'{jd:.9f}',returned,cells[0],allowance*86400)
        if kind=='vectors':
            if abs(_calendar_jd(cells[1])-jd)*86400>.001:
                raise ValueError('reference row calendar differs')
            numbers = cells[2:5]
        else:
            if cells[1] or cells[2]:
                raise ValueError('geocentric reference presence flags differ')
            numbers = cells[3:10]
        if any(_NUMBER.fullmatch(value) is None for value in numbers):
            raise ValueError('reference numeric token differs')
        values = tuple(map(float,numbers))
        if not all(math.isfinite(value) for value in values):
            raise ValueError('nonfinite reference quantity')
        if kind=='vectors':
            if not 0<math.hypot(*values)<math.inf:
                raise ValueError('invalid reference vector norm')
            result[jd]=(values,epoch)
        else:
            ra,dec,distance,speed,delta,icrf_ra,icrf_dec = values
            if not (0<=ra<360 and -90<=dec<=90 and distance>0 and abs(speed)<299792.458
                    and 0<=icrf_ra<360 and -90<=icrf_dec<=90):
                raise ValueError('reference apparent domains differ')
            result[jd]=(ApparentReference(*values),epoch)
    return result


@dataclass(frozen=True)
class PrecisionReferencePack:
    vectors: Mapping
    apparent: Mapping
    raw_hashes: Mapping
    reference_epochs: Mapping
    manifest_sha256: str


def load_precision_pack(directory: Path) -> PrecisionReferencePack:
    root=directory.resolve();path=root/'manifest.json'
    if path.is_symlink() or not path.is_file() or path.stat().st_size>65536:
        raise ValueError('precision manifest unavailable/oversized')
    with path.open('rb') as stream:
        raw_manifest=stream.read(65537)
    if len(raw_manifest)>65536:
        raise ValueError('precision manifest oversized')
    manifest=_decode(raw_manifest)
    _keys(manifest,{'schema_version','source','scope','limitations','acceptance','files'},'precision manifest')
    if manifest['schema_version']!='precision-window-reference.v1' or manifest['source']!='NASA/JPL Horizons API' \
            or not _same_typed(manifest['acceptance'],ACCEPTANCE) or any(not isinstance(manifest[k],str) or not manifest[k].strip() for k in ('scope','limitations')):
        raise ValueError('precision reference source/scope/budgets differ')
    _keys(manifest['files'],set(METADATA),'precision metadata files')
    files={}
    for key,name in METADATA.items():
        _keys(manifest['files'][key],{'path','bytes','sha256'},key)
        files[key]=_file(root,manifest['files'][key],name,1048576)
    if hashlib.sha256(files['plan']).hexdigest()!=PLAN_SHA256:
        raise ValueError('precision plan differs')
    if not _same_typed(_decode(files['initial_spec']),query_spec(64)) or not _same_typed(_decode(files['query_spec']),query_spec(32)):
        raise ValueError('precision query matrix differs')
    amendment=_decode(files['amendment']);initial=_decode(files['initial_progress'])
    _keys(amendment,{'schema_version','recorded_at_utc','reason','failed_request_url','initial_attempt_limit',
        'final_observed_http_status','revised_tlist_batch_limit','numerical_matrix_and_budgets_unchanged','retained_initial_files'},'transport amendment')
    _keys(initial,{'started_at_utc','records','raw_bytes','expected_queries'},'initial acquisition progress')
    expected_initial={'query-spec.json':files['initial_spec'],'query-builder.py.txt':files['initial_builder'],'initial-progress.json':files['initial_progress']}
    if amendment['schema_version']!='precision-transport-amendment.v1' or not isinstance(amendment['reason'],str) or not amendment['reason'].strip() \
            or not all(_same_typed(amendment[key],value) for key,value in {
                'revised_tlist_batch_limit':32,'initial_attempt_limit':2,'final_observed_http_status':502}.items()) \
            or amendment.get('numerical_matrix_and_budgets_unchanged') is not True \
            or amendment.get('failed_request_url')!=queries(64)[1]['request_url'] \
            or amendment.get('retained_initial_files')!={name:hashlib.sha256(raw).hexdigest() for name,raw in expected_initial.items()}:
        raise ValueError('transport amendment correspondence differs')
    acquisition=_decode(files['acquisition'])
    _keys(acquisition,{'schema_version','source','endpoint','started_at_utc','completed_at_utc','records','raw_bytes','transport_amendment_sha256'},'precision acquisition')
    if acquisition['schema_version']!='precision-window-acquisition.v1' or acquisition['source']!=manifest['source'] \
            or acquisition['endpoint']!=ENDPOINT or acquisition['transport_amendment_sha256']!=hashlib.sha256(files['amendment']).hexdigest():
        raise ValueError('precision acquisition source differs')
    start,end=_utc(acquisition['started_at_utc']),_utc(acquisition['completed_at_utc'])
    if not start<=_utc(amendment['recorded_at_utc'])<=end:
        raise ValueError('transport amendment time differs')
    expected_queries=queries(32);records=acquisition['records']
    if end<start or not isinstance(records,list) or len(records)!=len(expected_queries):
        raise ValueError('complete ordered precision acquisition required')
    if initial.get('started_at_utc')!=acquisition['started_at_utc'] or not isinstance(initial['records'],list) or len(initial['records'])!=1 \
            or type(initial['expected_queries']) is not int or initial['expected_queries']!=len(queries(64)) \
            or not isinstance(initial['records'][0],dict) or type(initial['raw_bytes']) is not int or initial['raw_bytes']!=initial['records'][0].get('bytes'):
        raise ValueError('initial partial capture correspondence differs')
    epoch_batches={batch['id']:tuple(batch['epochs_jd']) for batch in batches()}
    vectors={};apparent={};hashes={};epochs={};total=0
    allowed={'manifest.json','README.md',*METADATA.values()}
    for index,(expected,record) in enumerate(zip(expected_queries,records)):
        _keys(record,set(expected)|{'path','bytes','sha256','api_version','attempts','reused_from_initial','acquired_at_utc'},'precision capture')
        if any(record[key]!=value or type(record[key]) is not type(value) for key,value in expected.items()) \
                or record['api_version']!='1.2' or type(record['attempts']) is not int or not 1<=record['attempts']<=2 \
                or record['reused_from_initial'] is not (index==0) or not start<=_utc(record['acquired_at_utc'])<=end:
            raise ValueError('precision capture identity/query/time/retry differs')
        if index==0 and not _same_typed({k:v for k,v in record.items() if k!='reused_from_initial'},initial['records'][0]):
            raise ValueError('reused capture differs from original partial attempt')
        name=f"{record['kind']}-{record['case']}-{record['batch']}.txt";allowed.add(name)
        raw=_file(root,record,name,1048576);total+=len(raw)
        if total>64*1048576:
            raise ValueError('precision raw byte budget exceeded')
        parsed=parse_response(raw.decode('utf-8'),expected,epoch_batches[record['batch']])
        destination=vectors if record['kind']=='vectors' else apparent
        for jd,(value,epoch) in parsed.items():
            key=record['case'],jd
            if key in destination:
                raise ValueError('duplicate precision reference')
            destination[key]=value;hashes[(record['kind'],*key)]=record['sha256'];epochs[(record['kind'],*key)]=epoch
    if type(acquisition['raw_bytes']) is not int or acquisition['raw_bytes']!=total \
            or len(vectors)!=len(EPOCHS)*len(VECTOR_CASES) or len(apparent)!=len(EPOCHS)*len(APPARENT_CASES):
        raise ValueError('precision total byte/matrix correspondence differs')
    if {p.name for p in root.iterdir()}-allowed:
        raise ValueError('unlisted precision reference file')
    return PrecisionReferencePack(MappingProxyType(vectors),MappingProxyType(apparent),MappingProxyType(hashes),MappingProxyType(epochs),hashlib.sha256(raw_manifest).hexdigest())
