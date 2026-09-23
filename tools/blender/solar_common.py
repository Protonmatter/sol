"""Pure validation and transfer helpers; no bpy dependency."""
import hashlib
import json
import math
from pathlib import Path

RADIUS_M = 695700000.0

def transfer(j: float, alpha: float, length: float, incident: float = 0.0) -> float:
    if any(not math.isfinite(v) or v < 0 for v in (j, alpha, length, incident)):
        raise ValueError('transfer inputs must be finite and nonnegative')
    return incident * math.exp(-alpha * length) + (j * length if alpha == 0 else j * -math.expm1(-alpha * length) / alpha)

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def checked_file(root: Path, relative: str, expected: str) -> Path:
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError('bundle path escapes root or is missing')
    if sha256(path) != expected:
        raise ValueError('bundle SHA-256 mismatch')
    return path

def validate_packet(packet: dict) -> dict:
    if packet.get('schema_version') != 'solar-render-packet.v1' or packet.get('frame') != 'carrington_z_north_west_positive':
        raise ValueError('unsupported packet schema or coordinates')
    if packet.get('radius_km') != 695700 or packet.get('relative_emission') is not True:
        raise ValueError('unsupported units or emission calibration')
    surface = packet['surface']
    for key in ('wavelength_nm', 'quiet_temperature_k', 'granule_km', 'lifetime_s'):
        if not math.isfinite(surface[key]) or surface[key] <= 0:
            raise ValueError('invalid surface parameter')
    if not 0 <= surface['limb_u'] <= 1 or not math.isfinite(packet['time_s']):
        raise ValueError('invalid limb law or scenario time')
    regions = packet.get('regions', [])
    if len(regions) > 256:
        raise ValueError('region budget exceeded')
    for r in regions:
        if len(r['center']) != 3 or any(not math.isfinite(v) for v in r['center']) or abs(sum(v*v for v in r['center'])-1) > 1e-3:
            raise ValueError('invalid region direction')
        if not 0 < r['radius_rad'] <= .5 or not 1000 <= r['temperature_k'] <= 10000:
            raise ValueError('invalid region size or temperature')
    strands = packet.get('strands', [])
    if not isinstance(strands, list) or len(strands) > 4096:
        raise ValueError('strand budget exceeded')
    total = 0
    for strand in strands:
        points = strand['points']
        total += len(points)
        if not 2 <= len(points) <= 8192 or total > 1000000:
            raise ValueError('point budget exceeded')
        if not math.isfinite(strand['emission_relative']) or strand['emission_relative'] < 0:
            raise ValueError('invalid emissivity')
        for p in points:
            if len(p) != 4 or any(not math.isfinite(v) for v in p) or not 0 < p[3] <= .2 or sum(v*v for v in p[:3]) > 16:
                raise ValueError('invalid point or radius')
    return packet

def load_packet(path: Path) -> dict:
    if path.stat().st_size > 128 * 1024 * 1024:
        raise ValueError('packet too large')
    return validate_packet(json.loads(path.read_text(encoding='utf-8')))

def receipt(root: Path, metadata: dict) -> None:
    files = [{'path': p.relative_to(root).as_posix(), 'sha256': sha256(p), 'bytes': p.stat().st_size} for p in sorted(root.rglob('*')) if p.is_file() and p.name != 'receipt.json']
    (root / 'receipt.json').write_text(json.dumps({**metadata, 'files': files}, indent=2), encoding='utf-8')


def validate_grid_semantics(entry: dict, time_s: float) -> dict:
    expected = dict(dtype='float32-le', layout='x-fastest-y-next-z-slowest', bounds=[-2.5,2.5], units='relative_emission_per_solar_radius', voxel_centers=True)
    if any(entry.get(k) != v for k,v in expected.items()):
        raise ValueError('unsupported grid semantics')
    dims=entry.get('dimensions',[])
    if len(dims)!=3 or any(type(x) is not int for x in dims) or len(set(dims))!=1 or not 2<=dims[0]<=128:
        raise ValueError('unsupported grid dimensions')
    source_time=entry.get('time_s')
    if not isinstance(source_time,(float,int)) or not math.isfinite(source_time):
        raise ValueError('invalid grid source time')
    policy='instantaneous'
    if source_time != time_s:
        if source_time != 0 or entry.get('temporal_authority') != 'time-averaged illustrative background; rotation transform only':
            raise ValueError('grid time mismatch without supported temporal policy')
        policy='differential-unadvection-of-t0-background'
    return dict(size=dims[0],bounds=entry['bounds'],source_time_s=source_time,sample_time_s=time_s,temporal_policy=policy)

def validate_surface_semantics(entry: dict, time_s: float, expected_transfer_id: str|None=None) -> dict:
    expected=dict(dtype='float32-le',longitude_positive='west',latitude_row_zero='south',texel_centers=True,units='relative_emission')
    if any(entry.get(k)!=v for k,v in expected.items()):
        raise ValueError('unsupported surface semantics')
    dims=entry.get('dimensions',[])
    if len(dims)!=2 or any(type(x) is not int for x in dims) or not 2<=dims[0]<=4096 or not 2<=dims[1]<=2048:
        raise ValueError('invalid surface dimensions')
    if entry.get('time_s') != time_s:
        raise ValueError('instantaneous surface time mismatch')
    transfer_id=entry.get('transfer_id')
    if transfer_id not in (None,'euv-network-exp-v1','hierarchical-euv-linear-v1'):raise ValueError('Unsupported surface transfer identity')
    if expected_transfer_id and transfer_id!=expected_transfer_id:raise ValueError('Surface transfer identity does not match packet model')
    if transfer_id=='hierarchical-euv-linear-v1' and entry.get('temporal_policy')!='absolute-differential-unadvection-already-applied':raise ValueError('Unsupported hierarchical surface temporal policy')
    return dict(width=dims[0],height=dims[1],time_s=time_s,transfer_id=transfer_id)

def admit_manifest(root: Path, manifest: dict, packet_path: Path, packet: dict, volume_path: Path|None=None, surface_path: Path|None=None) -> dict:
    expected=dict(schema_version='solar-dynamic-appearance.v1',frame='carrington_z_north_west_positive',radius_km=695700)
    if any(manifest.get(k)!=v for k,v in expected.items()):raise ValueError('unsupported manifest semantics')
    rotation=manifest.get('rotation',{})
    if rotation.get('coefficients_deg_per_day') != [14.713,-2.396,-1.787] or rotation.get('frame_rate_deg_per_day') != 14.1844:
        raise ValueError('unsupported rotation authority')
    if manifest.get('id')!=packet['recipe_id'] or manifest.get('seed')!=packet['seed'] or manifest.get('recipe_hash')!=packet.get('recipe_hash'):
        raise ValueError('manifest/packet recipe identity mismatch')
    def select(entries,path):
        matches=[e for e in entries if e and (root/e['path']).resolve()==path.resolve()]
        if not matches:raise ValueError('source absent from manifest role')
        # Base/reference aliases may add provenance but cannot disagree on any field.
        entry={}
        for candidate in matches:
            for key,value in candidate.items():
                if key in entry and json.dumps(entry[key],sort_keys=True)!=json.dumps(value,sort_keys=True):
                    raise ValueError('conflicting manifest artifact references')
                entry[key]=value
        checked_file(root,entry['path'],entry['sha256'])
        if path.stat().st_size != entry['bytes']:raise ValueError('artifact byte count mismatch')
        return entry
    frames=manifest.get('keyframes',[])
    selected=select([manifest.get('packet')]+[k['packet'] for k in frames],packet_path)
    times=[k['time_s'] for k in frames if (root/k['packet']['path']).resolve()==packet_path.resolve()]
    if times and any(t!=packet['time_s'] for t in times):raise ValueError('keyframe/packet time mismatch')
    if not times and packet['time_s']!=0:raise ValueError('nonzero packet lacks explicit keyframe time')
    result={'packet':selected,'recipe_hash':manifest.get('recipe_hash')}
    if volume_path:
        candidates=list(manifest.get('volumes',[]))
        candidates += [{**v['background'],'temporal_authority':v.get('temporal_authority'),'parent_volume':v['path']} for v in manifest.get('volumes',[]) if v.get('background')]
        e=select(candidates,volume_path);result['volume']=e;result['volume_interpretation']=validate_grid_semantics(e,packet['time_s'])
        if e.get('pulse'):
            validate_pulse_semantics(e['pulse'],result['volume_interpretation']['size'])
            pulse_file=checked_file(root,e['pulse']['path'],e['pulse']['sha256'])
            if pulse_file.stat().st_size!=e['pulse']['bytes']:raise ValueError('pulse byte count mismatch')
    if surface_path:
        e=select([manifest.get('surface')]+manifest.get('surface_keyframes',[]),surface_path);result['surface']=e;result['surface_interpretation']=validate_surface_semantics(e,packet['time_s'],expected_transfer_id='hierarchical-euv-linear-v1' if packet.get('emission_model') else None)
        if e.get('recipe_hash',packet.get('recipe_hash'))!=packet.get('recipe_hash'):raise ValueError('surface recipe identity mismatch')
    return result

def validate_reference_bounds(width: int,height: int,samples: int) -> None:
    if any(type(v) is not int for v in (width,height,samples)) or not 32<=width<=1024 or not 32<=height<=1024 or not 1<=samples<=256:
        raise ValueError('reference dimensions/samples exceed bounds')

def rgb_statistics(pixels) -> dict:
    if len(pixels)%4:raise ValueError('invalid RGBA buffer')
    rgb=[v for i,v in enumerate(pixels) if i%4!=3]
    if not rgb or not all(math.isfinite(v) for v in rgb) or max(rgb)<=0:raise ValueError('nonfinite or blank RGB render')
    return dict(min=min(rgb),max=max(rgb),mean=sum(rgb)/len(rgb))

def validate_pulse_semantics(entry: dict,size: int) -> None:
    expected=dict(dimensions=[size]*3,components=4,dtype='float32-le',layout='x-fastest-y-next-z-slowest-RGBA',channels=['arc_length_R','onset_s','duration_s','support_relative'],width_R=.04,speed_R_per_s=.0002,amplitude=.3,window='sin_squared_nonrepeating')
    if any(entry.get(k)!=v for k,v in expected.items()):raise ValueError('unsupported pulse semantics')
    if entry.get('bytes')!=size**3*16:raise ValueError('pulse length mismatch')

def gaussian_emissivity(emission: float, start, end, gain_start: float=1.0, gain_end: float=1.0) -> float:
    """R4 per-segment peak coefficient; R2/R3 default gains preserve old behavior."""
    if len(start)!=3 or len(end)!=3 or not all(math.isfinite(v) for v in [emission,gain_start,gain_end,*start,*end]):
        raise ValueError('Invalid Gaussian coefficient input')
    if emission<0 or not 0<=gain_start<=1 or not 0<=gain_end<=1:
        raise ValueError('Invalid Gaussian emission gain')
    altitude=max(0,math.sqrt(sum(((a+b)*.5)**2 for a,b in zip(start,end)))-1)
    return emission*(gain_start+gain_end)*.5*math.exp(-altitude/.3)
