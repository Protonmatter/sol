#!/usr/bin/env python3
"""Offline build gate for numerical terrain and source-grounded solar appearance.

Validates schema/semantics, source provenance, local asset bounds and SHA-256,
numeric terrain extents, PNG dimensions and generated browser-data parity.
Historical source trees without either runtime remain compatible. No network,
decoding dependency, file writes or qualification upgrade is performed.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import re
import struct
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
SHA=re.compile(r"[0-9a-f]{64}")
MANIFEST_CAP=256*1024
TERRAIN_CAP=8*1024*1024
SOLAR_CAP=2*1024*1024
SOURCES=("nasa.gov","pds-geosciences.wustl.edu","api.helioviewer.org")


def text(value: object, name: str) -> str:
    if not isinstance(value,str) or not value.strip():
        raise ValueError(f"missing physical asset {name}")
    return value


def number(value: object, name: str, low: float, high: float) -> float:
    if type(value) not in (int,float) or not math.isfinite(value) or not low<=value<=high:
        raise ValueError(f"invalid physical asset {name}")
    return value


def array(value: object, count: int, name: str, low: float=-1e20, high: float=1e20) -> list:
    if not isinstance(value,list) or len(value)!=count:
        raise ValueError(f"invalid physical asset {name}")
    for item in value:number(item,name,low,high)
    return value


def source_url(value: object) -> None:
    url=urlparse(text(value,"source URL"));host=url.hostname or ""
    if url.scheme!="https" or url.username or url.password or url.port not in (None,443) or not any(host==h or host.endswith("."+h) for h in SOURCES):
        raise ValueError("physical source requires a reviewed NASA/mission archive HTTPS origin")


def sha(value: object) -> None:
    if not isinstance(value,str) or not SHA.fullmatch(value):raise ValueError("invalid physical source hash")


def timestamp(value: object) -> datetime:
    try:
        parsed=datetime.fromisoformat(text(value,"source epoch").replace("Z","+00:00"))
        if parsed.tzinfo is None:raise ValueError("source epoch requires time zone")
        return parsed
    except (ValueError,TypeError) as exc:raise ValueError("invalid physical source epoch") from exc


def read_json(path: Path) -> dict:
    if not path.is_file() or path.is_symlink() or not 0<path.stat().st_size<=MANIFEST_CAP:
        raise ValueError("missing, linked or oversized physical manifest")
    def pairs(entries):
        out={}
        for key,value in entries:
            if key in out:raise ValueError(f"duplicate physical manifest field: {key}")
            out[key]=value
        return out
    def constant(value):raise ValueError(f"nonfinite physical manifest value: {value}")
    return json.loads(path.read_text(encoding="utf-8"),object_pairs_hook=pairs,parse_constant=constant)


def asset(root: Path, record: dict, kind: str, cap: int) -> bytes:
    if not isinstance(record,dict):raise ValueError("invalid physical asset record")
    relative=record.get("path")
    if not isinstance(relative,str) or not re.fullmatch(r"textures/"+kind+r"/[a-z0-9.-]+",relative):
        raise ValueError("invalid physical same-origin asset path")
    size=record.get("bytes")
    if type(size) is not int or not 0<size<=cap:raise ValueError("physical asset byte cap exceeded")
    sha(record.get("sha256"))
    file=root/relative
    if any(part.is_symlink() for part in (file,*file.parents)) or not file.resolve().is_relative_to(root.resolve()) or not file.is_file():
        raise ValueError("missing, linked or escaped physical asset")
    if file.stat().st_size!=size:raise ValueError("physical asset size mismatch")
    raw=file.read_bytes()
    if len(raw)!=size or hashlib.sha256(raw).hexdigest()!=record["sha256"]:
        raise ValueError("physical asset hash identity mismatch")
    return raw


def validate_terrain(data: dict, root: Path) -> int:
    if not isinstance(data,dict) or data.get("schema_version")!="terrain-assets.v1" or set(data)!={"schema_version","references"}:
        raise ValueError("invalid terrain manifest schema")
    refs=data.get("references")
    if not isinstance(refs,list) or not 1<=len(refs)<=2:raise ValueError("invalid terrain reference count")
    bodies=set();paths=set()
    for ref in refs:
        if not isinstance(ref,dict):raise ValueError("invalid terrain reference")
        for name in ("id","coverage","label","observation_label","credits","derivation","limitations"):
            text(ref.get(name),name)
        body=ref.get("body")
        if body not in ("Moon","Mars") or body in bodies:raise ValueError("unsupported/duplicate terrain body")
        bodies.add(body)
        if ref.get("path") in paths:raise ValueError("duplicate terrain asset path")
        paths.add(ref.get("path"))
        width=number(ref.get("width"),"terrain width",4,4096);height=number(ref.get("height"),"terrain height",2,2048)
        if type(width) is not int or type(height) is not int or width!=2*height or ref.get("bytes")!=width*height*2:
            raise ValueError("terrain grid/byte dimensions mismatch")
        if ref.get("encoding")!="uint16-little-endian" or ref.get("nodata_code")!=65535 or ref.get("quantity")!="radial-height-from-reference-sphere":
            raise ValueError("unsupported terrain quantity/encoding")
        offset=number(ref.get("heightOffsetKm"),"height offset",-100,100)
        scale=number(ref.get("heightScaleKm"),"height scale",1e-6,1)
        radius=number(ref.get("referenceRadiusKm"),"reference radius",100,10000)
        minimum=number(ref.get("minHeightKm"),"minimum height",-100,100);maximum=number(ref.get("maxHeightKm"),"maximum height",minimum,100)
        for key,expected in (("minRadiusKm",radius+minimum),("maxRadiusKm",radius+maximum)):
            if abs(number(ref.get(key),key,1,20000)-expected)>1e-8:raise ValueError("terrain radius extent mismatch")
        native=number(ref.get("nativeDegreesPerTexel"),"native degrees",.0001,90)
        if abs(native-360/width)>1e-10:raise ValueError("terrain native angular resolution mismatch")
        if abs(number(ref.get("nativeEquatorialKmPerTexel"),"native km",1e-8,2000)-radius*math.radians(native))>1e-8:
            raise ValueError("terrain native linear resolution mismatch")
        mapping=ref.get("mapping",{})
        if not isinstance(mapping,dict) or mapping.get("longitudeDirection")!="east" or mapping.get("latitudeType")!="planetocentric" or mapping.get("latitudeBounds")!=[-90,90] or mapping.get("pixelRegistration")!="cell-centered" or mapping.get("rowOrder")!="north-to-south":
            raise ValueError("unsupported terrain mapping")
        number(mapping.get("primeMeridianU"),"prime meridian",0,1)
        source_url(ref.get("source_url"));sha(ref.get("source_sha256"))
        number(ref.get("source_bytes"),"original source bytes",1,256*1024*1024)
        try:datetime.fromisoformat(text(ref.get("source_retrieved_at"),"retrieval date"))
        except ValueError as exc:raise ValueError("invalid terrain retrieval date") from exc
        urls=ref.get("metadata_urls")
        if not isinstance(urls,list) or not urls:raise ValueError("missing terrain metadata references")
        for url in urls:source_url(url)
        if not isinstance(ref.get("metadata_sha256"),dict):raise ValueError("missing terrain metadata hash record")
        for value in ref["metadata_sha256"].values():sha(value)
        raw=asset(root,ref,"terrain",TERRAIN_CAP)
        lo=65535;hi=0
        for (code,) in struct.iter_unpack("<H",raw):
            if code==65535:raise ValueError("admitted terrain contains unavailable source samples")
            lo=min(lo,code);hi=max(hi,code)
        if abs(lo*scale+offset-minimum)>1e-8 or abs(hi*scale+offset-maximum)>1e-8:
            raise ValueError("terrain decoded bounds differ from declared extents")
    return len(refs)


def validate_solar(data: dict, root: Path) -> int:
    if not isinstance(data,dict) or data.get("schema_version")!="solar-appearance.v1":raise ValueError("invalid solar manifest schema")
    expected={"schema_version","id","label","status","credits","color_interpretation","source_kind","atlas","frames","far_side",
              "surface_min_mu","surface_full_mu","reference_frame","surface_interpretation","playback","geometry"}
    if set(data)!=expected:raise ValueError("unknown or missing solar manifest field")
    for name in ("id","label","credits","color_interpretation","source_kind","reference_frame","surface_interpretation"):
        text(data.get(name),name)
    if data.get("status")!="educational-reconstruction" or data.get("far_side")!="unavailable":
        raise ValueError("solar reconstruction coverage/status not qualified")
    low=number(data.get("surface_min_mu"),"solar coverage minimum",0,1)
    high=number(data.get("surface_full_mu"),"solar coverage full",low,1)
    if low!=.12 or high!=.2:raise ValueError("solar coverage differs from shader contract")
    atlas=data.get("atlas",{});raw=asset(root,atlas,"solar",SOLAR_CAP)
    if len(raw)<33 or raw[:8]!=b"\x89PNG\r\n\x1a\n" or raw[12:16]!=b"IHDR" or tuple(struct.unpack(">II",raw[16:24]))!=(2048,1024) or raw[24:26]!=bytes([8,0]):
        raise ValueError("solar atlas PNG geometry/encoding mismatch")
    if atlas.get("dimensions")!=[2048,1024] or atlas.get("frame_dimensions")!=[1024,1024]:raise ValueError("solar atlas dimensions mismatch")
    text(atlas.get("resampling"),"solar derivation")
    frames=data.get("frames")
    if not isinstance(frames,list) or len(frames)!=2:raise ValueError("solar requires two pinned reference frames")
    epochs=[];ids=set()
    for frame in frames:
        if not isinstance(frame,dict):raise ValueError("invalid solar source frame")
        epochs.append(timestamp(frame.get("observed_at")))
        image_id=text(frame.get("image_id"),"source image identity")
        if image_id in ids or not image_id.isdigit():raise ValueError("duplicate/invalid solar image identity")
        ids.add(image_id)
        for key in ("original_sha256","header_sha256"):sha(frame.get(key))
        for key in ("source_url","metadata_url"):source_url(frame.get(key))
        number(frame.get("original_bytes"),"solar original bytes",1,8*1024*1024)
        if frame.get("wavelength_angstrom")!=171 or frame.get("quality_word")!=1073741824:raise ValueError("unsupported solar wavelength/quality recipe")
        wcs=frame.get("wcs",{})
        if not isinstance(wcs,dict) or wcs.get("dimensions")!=[4096,4096] or wcs.get("projection")!="HPLN-TAN/HPLT-TAN" or wcs.get("rotation_deg")!=0:
            raise ValueError("unsupported solar WCS projection")
        array(wcs.get("crpix"),2,"CRPIX",1,4096);array(wcs.get("cdelt_arcsec"),2,"CDELT",.5,.7)
        number(wcs.get("longitude_deg"),"source longitude",0,360);number(wcs.get("latitude_deg"),"source latitude",-8,8)
        distance=number(wcs.get("observer_distance_m"),"observer distance",1e11,2e11)
        radius=number(wcs.get("solar_reference_radius_m"),"reference solar radius",6e8,8e8)
        if not 100<distance/radius<300:raise ValueError("invalid solar observer radius")
        number(wcs.get("radius_pixels"),"observed image radius",1500,1700)
    if not 0<(epochs[1]-epochs[0]).total_seconds()<=3600:raise ValueError("solar source epochs outside reference interval")
    playback=data.get("playback",{})
    if not isinstance(playback,dict) or playback.get("loop") is not False:raise ValueError("solar playback must stop at source interval end")
    number(playback.get("duration_seconds"),"source playback duration",1,60)
    for key in ("interpolation","reduced_motion"):text(playback.get(key),key)
    geometry=data.get("geometry",{})
    if not isinstance(geometry,dict) or geometry.get("status")!="modeled-reference" or geometry.get("extent_solar_radii")!=1.35 or geometry.get("ray_samples")!=32:
        raise ValueError("solar model geometry/extent not qualified")
    for key in ("model","limits"):text(geometry.get(key),key)
    loops=geometry.get("loops")
    if not isinstance(loops,list) or len(loops)!=12:raise ValueError("solar arcade count differs from shader contract")
    for loop in loops:
        if not isinstance(loop,dict):raise ValueError("invalid solar model loop")
        normal=array(loop.get("normal"),3,"arc normal",-1,1);tangent=array(loop.get("tangent"),3,"arc tangent",-1,1)
        if abs(sum(v*v for v in normal)-1)>1e-8 or abs(sum(v*v for v in tangent)-1)>1e-8 or abs(sum(x*y for x,y in zip(normal,tangent)))>1e-8:
            raise ValueError("solar model basis is not orthonormal")
        radius=number(loop.get("radius"),"arc radius",.01,.3);width=number(loop.get("width"),"arc width",.001,.04)
        number(loop.get("gain"),"arc gain",0,1);array(loop.get("source_anchor_pixel_128"),2,"source anchor",0,127)
        if math.sqrt(1-radius*radius)+radius+4*width>1.35:raise ValueError("solar modeled emission escapes declared extent")
    return 1


def incident_module(file: Path) -> str:
    """Read a bounded local identity input, canonicalizing platform line endings."""
    if not file.is_file() or any(part.is_symlink() for part in (file,*file.parents)) or not 0<file.stat().st_size<=MANIFEST_CAP:
        raise ValueError('missing, linked or oversized incident identity module')
    return file.read_text(encoding='utf-8')


def incident_generator_glsl(generator: str, solver: str) -> str:
    """Expand the two reviewed, unescaped GLSL literals without executing JavaScript."""
    def literal(content: str, declaration: str) -> str:
        matches=re.findall(r'^'+re.escape(declaration)+r'\s*=\s*`([^`]*)`;',content,re.M)
        if len(matches)!=1 or '\\' in matches[0]:raise ValueError('unsupported incident generator template format')
        return matches[0]
    fragment=literal(generator,'const fragment')
    expected=('ATMOSPHERE_GLSL','ATMOSPHERE_REFRACTION_GLSL')
    if sorted(re.findall(r'\$\{([^}]+)\}',fragment))!=sorted(expected):
        raise ValueError('unsupported incident generator template expansion')
    for name in expected:
        value=literal(solver,'export const '+name)
        if '${' in value:raise ValueError('unsupported nested incident generator template expansion')
        fragment=fragment.replace('${'+name+'}',value)
    if '${' in fragment:raise ValueError('unsupported incident generator template expansion')
    return fragment


def validate_incident_fields(root: Path) -> int:
    """Pin offline fields and their input implementations without executing JS.

    The runtime separately compares profile_sha256 with the actual serialized
    profile. Here profile_source_sha256 binds that profile's implementation.
    Regeneration is never a build side effect.
    """
    module=root/'js/atmosphereIncidentManifest.js'
    if not module.exists() and not (root/'js/atmosphereIncident.js').exists():return 0
    if not module.is_file() or module.is_symlink():raise ValueError('incident runtime requires field manifest')
    match=re.fullmatch(r'//[^\n]*\nexport const INCIDENT_FIELDS=Object.freeze\((\{.*\})\);\n',incident_module(module),re.S)
    if not match:raise ValueError('invalid incident field manifest')
    def unique(entries):
        result={}
        for key,value in entries:
            if key in result:raise ValueError('duplicate incident field manifest key')
            result[key]=value
        return result
    def constant(value):raise ValueError('nonfinite incident manifest value: '+value)
    records=json.loads(match[1],object_pairs_hook=unique,parse_constant=constant)
    if set(records)!={'Earth','Mars'}:raise ValueError('unsupported incident field bodies')
    sources={key:incident_module(file) for key,file in {
        'solver_source_sha256':root/'js/atmosphereShaders.js',
        'generator_source_sha256':ROOT/'tools/prepare_atmosphere_incident.mjs',
        'profile_source_sha256':root/'js/atmosphereOptics.js',
        'field_source_sha256':root/'js/atmosphereIncident.js',
    }.items()}
    identities={key:hashlib.sha256(value.encode()).hexdigest() for key,value in sources.items()}
    identities['generator_sha256']=hashlib.sha256(incident_generator_glsl(sources['generator_source_sha256'],sources['solver_source_sha256']).encode()).hexdigest()
    domains={'Earth':{'minHeightKm':0,'maxHeightKm':16,'quadratic':True},
             'Mars':{'minHeightKm':-24,'maxHeightKm':24,'quadratic':False}}
    for body,ref in records.items():
        if not isinstance(ref,dict):raise ValueError('invalid incident field record')
        if ref.get('profile_encoding')!='atmosphere-profile-binary32-v1':raise ValueError('incident field profile encoding changed')
        if ref.get('dimensions')!=[385,65,3] or ref.get('bytes')!=385*65*3*16 or ref.get('format')!='little-endian-rgba32f-bend-columns-v1':
            raise ValueError('incident field shape/format changed')
        if ref.get('domain')!=domains[body] or type(ref['domain'].get('quadratic')) is not bool:
            raise ValueError('incident field domain changed')
        if ref.get('path')!=f'../data/optics/{body.lower()}-incident-v1.f32':raise ValueError('incident field path escaped')
        for key in ('sha256','profile_sha256',*identities):sha(ref.get(key))
        file=root/'data/optics'/f'{body.lower()}-incident-v1.f32'
        if not file.is_file() or any(p.is_symlink() for p in (file,*file.parents)) or file.stat().st_size!=ref['bytes']:
            raise ValueError('missing/linked/wrong-sized incident field')
        raw=file.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=ref['sha256']:raise ValueError('incident field hash mismatch')
        for bend,molecular,aerosol,valid in struct.iter_unpack('<ffff',raw):
            if not all(math.isfinite(v) for v in (bend,molecular,aerosol,valid)) or molecular<0 or aerosol<0 or valid!=1:
                raise ValueError('incident field invalid numerical sample')
        if any(ref[key]!=value for key,value in identities.items()):
            raise ValueError('incident field generator/solver/profile/domain source identity changed')
    return len(records)


def validate_atmosphere_columns(root: Path) -> int:
    """Admit immutable optical columns without generating them during a build."""
    module=root/'js/atmosphereColumnManifest.js'
    if not module.exists() and not (root/'js/atmosphereColumnField.js').exists():return 0
    if not module.is_file() or module.is_symlink():raise ValueError('column runtime requires field manifest')
    match=re.fullmatch(r'//[^\n]*\nexport const ATMOSPHERE_COLUMN_FIELDS=Object.freeze\((\{.*\})\);\n',incident_module(module),re.S)
    if not match:raise ValueError('invalid column field manifest')
    def unique(entries):
        result={}
        for key,value in entries:
            if key in result:raise ValueError('duplicate column field key')
            result[key]=value
        return result
    def constant(value):raise ValueError('nonfinite column manifest value: '+value)
    records=json.loads(match[1],object_pairs_hook=unique,parse_constant=constant)
    if set(records)!={'Earth','Mars'}:raise ValueError('unsupported column field bodies')
    files={'generator_source_sha256':ROOT/'tools/prepare_atmosphere_columns.mjs',
           'field_source_sha256':root/'js/atmosphereColumnField.js',
           'solver_source_sha256':root/'js/atmosphereShaders.js',
           'profile_source_sha256':root/'js/atmosphereOptics.js'}
    identities={key:hashlib.sha256(incident_module(file).encode()).hexdigest() for key,file in files.items()}
    for body,ref in records.items():
        if not isinstance(ref,dict) or set(ref)!={'path','dimensions','bytes','sha256','format','profile_encoding','profile_sha256',*identities}:
            raise ValueError('invalid column field record')
        if ref.get('profile_encoding')!='atmosphere-profile-binary32-v1' or ref.get('dimensions')!=[512,512,2] or ref.get('bytes')!=512*512*2*4 or ref.get('format')!='little-endian-rg32f-outward-columns-v1':
            raise ValueError('column field shape or encoding changed')
        if ref.get('path')!=f'../data/optics/{body.lower()}-columns-v1.f32':raise ValueError('column field path escaped')
        for key in ('sha256','profile_sha256',*identities):sha(ref.get(key))
        file=root/'data/optics'/f'{body.lower()}-columns-v1.f32'
        if not file.is_file() or any(p.is_symlink() for p in (file,*file.parents)) or file.stat().st_size!=ref['bytes']:
            raise ValueError('missing/linked/wrong-sized column field')
        raw=file.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=ref['sha256']:raise ValueError('column field hash mismatch')
        if any(not math.isfinite(value) or value<0 or value>2000 for (value,) in struct.iter_unpack('<f',raw)):
            raise ValueError('invalid column field numerical sample')
        if any(ref[key]!=value for key,value in identities.items()):raise ValueError('column generator/solver/profile source identity changed')
    return len(records)


def validate_physical_source(root: Path) -> dict:
    root=root.resolve();counts={"terrain":0,"solar":0}
    for kind,filename,runtimes in (("terrain","terrain-assets.v1.json",("js/terrainAssets.js","js/terrainGeometry.js")),
                                   ("solar","solar-appearance.v1.json",("js/solarAppearance.js","js/solarAppearanceManifest.js","js/solarVolumeShaders.js"))):
        manifest=root/filename
        if not manifest.exists() and not any((root/name).exists() for name in runtimes):continue
        if not manifest.is_file():raise ValueError(f"{kind} runtime requires its physical manifest")
        data=read_json(manifest)
        counts[kind]=(validate_terrain if kind=="terrain" else validate_solar)(data,root)
        if kind=="solar":
            module=root/"js/solarAppearanceManifest.js"
            expected="// Generated by tools/prepare_solar_appearance.py; source and model qualifications are separate.\n"+"export const solarAppearanceManifest = "+json.dumps(data,separators=(",", ":"))+";\n"
            if not module.is_file() or module.is_symlink() or module.read_text(encoding="utf-8")!=expected:
                raise ValueError("browser solar manifest drift")
        else:
            module=root/"js/terrainAssets.js"
            content=module.read_text(encoding="utf-8") if module.is_file() and not module.is_symlink() else ""
            start,end="// BEGIN GENERATED TERRAIN REFERENCES","// END GENERATED TERRAIN REFERENCES"
            expected="\nconst REFERENCES = "+json.dumps(data["references"],indent=2,allow_nan=False)+";\n"
            if content.count(start)!=1 or content.count(end)!=1 or content.split(start,1)[1].split(end,1)[0]!=expected:
                raise ValueError("browser terrain manifest drift")
    incident=validate_incident_fields(root)
    if incident:counts['incident']=incident
    columns=validate_atmosphere_columns(root)
    if columns:counts['columns']=columns
    return counts


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--web-root",type=Path,default=ROOT/"apps/web")
    args=parser.parse_args()
    try:print(json.dumps({"status":"passed",**validate_physical_source(args.web_root)}));return 0
    except (ValueError,KeyError,TypeError,OSError) as exc:print(f"Physical asset validation failed: {exc}");return 1


if __name__=="__main__":raise SystemExit(main())
