"""Bind the AST-generated startup descriptor without requiring Node for staging."""
from __future__ import annotations
import copy
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit

NAME = 'startup-modules.v1.json'

class StartupMarkup(HTMLParser):
    def __init__(self) -> None:
        super().__init__(); self.markers=[]; self.roots=[]; self.preloads=[]; self.unsafe=False
    def handle_starttag(self,tag:str,attrs:list[tuple[str,str|None]]) -> None:
        values=dict(attrs)
        if tag in {'meta','script','link','base'} and (len(values)!=len(attrs) or tag=='base'):self.unsafe=True
        if tag=='script' and (values.get('type')!='module' or not values.get('src')):self.unsafe=True
        # This closed shell needs no embedded documents, inline event handlers or
        # navigation scripts. HTML attribute decoding occurs before URL parsing;
        # urlsplit also removes the tabs/newlines browsers ignore in schemes.
        if tag in {'iframe','frame','frameset','object','embed','portal','foreignobject'} or 'srcdoc' in values:self.unsafe=True
        if tag=='meta' and 'http-equiv' in values:self.unsafe=True
        for key,value in attrs:
            if key.startswith('on'):self.unsafe=True
            if isinstance(value,str):
                try:
                    if urlsplit(value).scheme.lower()=='javascript':self.unsafe=True
                except ValueError:self.unsafe=True
        if tag=='meta' and values.get('name')=='sol-startup-contract':self.markers.append(values.get('content'))
        if tag=='script' and values.get('type')=='module':self.roots.append(values.get('src'))
        if tag=='link' and values.get('rel')=='modulepreload':self.preloads.append(values.get('href'))

def module_path(url: str) -> str:
    if not isinstance(url,str) or not re.fullmatch(r'[A-Za-z0-9_./-]+\.js(?:\?v=[A-Za-z0-9._-]+)?',url):
        raise ValueError('invalid startup module URL identity')
    path=urlsplit(url).path
    if path.startswith('/') or any(part in {'','.','..'} for part in path.split('/')):raise ValueError('startup module escapes boundary')
    return path

def source_hash(root: Path,name: str) -> str:
    folder=root
    for part in name.split('/'):
        if not folder.is_dir() or part not in {item.name for item in folder.iterdir()}:raise ValueError('startup module missing or wrong case')
        folder=folder/part
        if folder.is_symlink():raise ValueError('startup module symlink')
    if not folder.is_file():raise ValueError('startup module missing file')
    return hashlib.sha256(folder.read_bytes()).hexdigest()

def validate_startup_contract(root: Path) -> dict | None:
    file=root/NAME
    new_loader=(root/'app.js').is_file() and './js/viewLoader.js' in (root/'app.js').read_text(encoding='utf-8')
    entry=root/'index.html'
    if not entry.is_file():
        if file.exists() or new_loader:raise ValueError('startup contract HTML entry missing')
        # Partial historical fixtures still reach the older source-admission gates.
        return None
    markup=StartupMarkup();markup.feed(entry.read_text(encoding='utf-8'))
    if not markup.markers and not file.exists() and not new_loader:return None
    if markup.unsafe or markup.markers!=[NAME] or not file.is_file() or file.is_symlink():raise ValueError('startup contract marker/file mismatch')
    value=json.loads(file.read_text(encoding='utf-8'))
    if not isinstance(value,dict) or set(value)!={'schema_version','roots','modules'} or value['schema_version']!='startup-modules.v1':raise ValueError('invalid startup descriptor')
    roots,modules=value['roots'],value['modules']
    if not isinstance(roots,list) or not roots or any(not isinstance(url,str) for url in roots) or roots!=sorted(set(roots)):raise ValueError('invalid startup roots')
    if not isinstance(modules,list) or not modules:raise ValueError('invalid startup modules')
    urls=[]
    for item in modules:
        if not isinstance(item,dict) or set(item)!={'url','path','sha256'}:raise ValueError('invalid startup module record')
        name=module_path(item['url']);urls.append(item['url'])
        if item['path']!=name or not isinstance(item['sha256'],str) or not re.fullmatch('[0-9a-f]{64}',item['sha256']):raise ValueError('invalid startup module hash/path')
        if source_hash(root,name)!=item['sha256']:raise ValueError(f'startup source hash drift: {name}')
    if urls!=sorted(set(urls)) or not set(roots)<=set(urls):raise ValueError('duplicate/unbound startup identities')
    if (any(not isinstance(url,str) for url in markup.roots+markup.preloads)
        or len(set(markup.roots))!=len(markup.roots) or sorted(markup.roots)!=roots
        or len(set(markup.preloads))!=len(markup.preloads)
        or set(markup.preloads)!=set(urls)-set(roots)):raise ValueError('startup HTML roots/preloads differ from descriptor')
    return value

def stamp_startup_contract(value:dict,root:Path,transform_url:Callable[[str],str],source_map:dict,copied_hashes:dict) -> None:
    stamped=copy.deepcopy(value);records={}
    for item in stamped['modules']:
        name=item['path']
        if source_map.get(name,{}).get('source_sha256')!=item['sha256']:raise ValueError('startup source changed during copy')
        expected=copied_hashes.get(name)
        if expected is None or source_hash(root,name)!=expected:raise ValueError('startup copied source hash drift')
        item.update(url=transform_url(item['url']),sha256=expected)
        if item['url'] in records and records[item['url']]!=item:raise ValueError('startup stamped identity collision')
        records[item['url']]=item
    stamped['roots']=sorted(set(map(transform_url,stamped['roots'])))
    stamped['modules']=[records[url]for url in sorted(records)]
    (root/NAME).write_text(json.dumps(stamped,indent=2)+'\n',encoding='utf-8',newline='\n')
