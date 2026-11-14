"""Independent raw event conventions, bounded admission and native CSV binding."""
from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest
from unittest import mock

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
import horizons_events as events

PACK=ROOT/'tests/fixtures/horizons-events-20261104'

class EventReferenceTests(unittest.TestCase):
    def test_all_raw_intervals_rebuild_the_exact_native_fixture(self):
        pack=events.load_event_pack(PACK)
        self.assertEqual(pack.manifest_sha256,'0db1e72cf5ded11d7f83221584004c04e1783185beb9bb45882ef0e52ea57343')
        self.assertEqual(len(pack.intervals),32)
        self.assertEqual(len(pack.responses),32)
        self.assertEqual(len({r.case_id for r in pack.intervals}),12)
        raw=events.event_csv(pack.intervals)
        self.assertEqual(raw,(PACK/'events.csv').read_bytes())
        self.assertEqual(raw,(ROOT/'crates/solar-ephemeris/data/horizons-events-20261104.csv').read_bytes())
        self.assertEqual({r.event for r in pack.intervals},{'rise','peak','set'})
        for r in pack.intervals:
            self.assertGreaterEqual(r.start_jd_utc,r.day_start_jd_utc)
            self.assertLess(r.end_jd_utc,r.day_start_jd_utc+1)
            self.assertLessEqual((r.end_jd_utc-r.start_jd_utc)*86400,2.001 if r.event=='peak' else 1.001)
            self.assertEqual(r.method,'sampled_unimodal_peak' if r.event=='peak' else 'threshold_crossing')
        with self.assertRaises(TypeError):pack.responses['other']='no'
        with self.assertRaises(Exception):pack.intervals[0].event='other'

    def test_reference_parser_rejects_wrong_frames_time_site_columns_and_values(self):
        plan=json.loads((PACK/'plan.json').read_bytes());q=plan['queries'][0]
        raw=(PACK/q['response']).read_bytes()
        accepted=events.parse_event_rows(raw,q)
        self.assertEqual(len(accepted),361)
        text=raw.decode()
        mutations=[
            text.replace('API VERSION: 1.2','API VERSION: 1.3'),
            text.replace('{source: DE441}','{source: DE440}',1),
            text.replace('Center body name: Earth (399)','Center body name: Earth (3)'),
            text.replace('0.0, 0.0, 0.0','1.0, 0.0, 0.0',1),
            text.replace('NO (AIRLESS)','YES (REFRACTED)'),
            text.replace('Gregorian','Mixed'),
            text.replace('Date_________JDUT','Date_________JDTDB'),
            text.replace('360 steps','359 steps'),
            text.replace('R.A.__(a-app)','R.A.__(ICRF)'),
            text.replace('1 au= 149597870.700 km','1 au= 149000000.000 km'),
            text.replace('$$EOE','$$SOE'),
        ]
        data=text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()
        mutations += [text.replace(data[0]+'\n','',1),text.replace(data[1],data[0],1)]
        row=data[0].split(',')
        for index,value in [(0,'nan'),(0,str(float(row[0])+.01)),(3,'inf'),(6,'91'),(7,'0'),(8,'nan'),(9,'1.0')]:
            changed=row.copy();changed[index]=value
            mutations.append(text.replace(data[0],','.join(changed),1))
        for i,value in enumerate(mutations):
            with self.subTest(i=i),self.assertRaises(ValueError):events.parse_event_rows(value.encode(),q)

    def test_peak_requires_the_entire_sampled_grid_to_be_strictly_unimodal(self):
        plan=json.loads((PACK/'plan.json').read_bytes());q=plan['queries'][0]
        rows=events.parse_event_rows((PACK/q['response']).read_bytes(),q)
        from dataclasses import replace
        interval=events.reference_interval(rows,q)
        self.assertAlmostEqual((interval.end_jd_utc-interval.start_jd_utc)*86400,2,delta=.001)
        # Neither an e nor a t marker is accepted as a sharper timing bound.
        for marker in ('e','t'):
            altered=tuple(replace(r,marker=marker) for r in rows)
            self.assertEqual(events.reference_interval(altered,q),interval)
        altered=list(rows);altered[10]=replace(altered[10],alt_deg=altered[9].alt_deg)
        with self.assertRaises(ValueError):events.reference_interval(tuple(altered),q)

    def test_crossing_requires_one_strict_directional_sign_change(self):
        plan=json.loads((PACK/'plan.json').read_bytes());q=next(q for q in plan['queries'] if q['event']=='rise')
        rows=events.parse_event_rows((PACK/q['response']).read_bytes(),q)
        from dataclasses import replace
        self.assertEqual(events.reference_interval(rows,q).method,'threshold_crossing')
        with self.assertRaises(ValueError):events.reference_interval(tuple(replace(r,alt_deg=10.0) for r in rows),q)
        altered=list(rows);altered[0]=replace(altered[0],alt_deg=10.0)
        with self.assertRaises(ValueError):events.reference_interval(tuple(altered),q)

    def test_changed_metadata_paths_members_controls_and_derived_data_fail_closed(self):
        changes=[lambda m:m['records'].pop(),lambda m:m['records'].__setitem__(1,m['records'][0]),
            lambda m:m['records'][0].__setitem__('path','../outside.txt'),
            lambda m:m['records'][0].__setitem__('bytes',True),
            lambda m:m.__setitem__('quantities',[2,4,49]),
            lambda m:m.__setitem__('source','other'),lambda m:m.__setitem__('extra',1)]
        for i,change in enumerate(changes):
            with self.subTest(i=i),tempfile.TemporaryDirectory() as folder:
                target=Path(folder)/'pack';shutil.copytree(PACK,target)
                value=json.loads((target/'manifest.json').read_bytes());change(value)
                (target/'manifest.json').write_text(json.dumps(value),encoding='utf-8')
                with self.assertRaises(ValueError):events.load_event_pack(target)
        for name in ('plan.json','acquisition.json','events.csv','sun-0-20260321-peak.txt'):
            with self.subTest(name=name),tempfile.TemporaryDirectory() as folder:
                target=Path(folder)/'pack';shutil.copytree(PACK,target)
                with (target/name).open('ab') as stream:stream.write(b'changed')
                with self.assertRaises(ValueError):events.load_event_pack(target)

    def test_duplicate_json_and_oversized_manifest_fail_closed(self):
        for content in ('{"schema_version":1,"schema_version":2}', ' '*131073):
            with tempfile.TemporaryDirectory() as folder:
                target=Path(folder);(target/'manifest.json').write_text(content)
                with self.assertRaises(ValueError):events.load_event_pack(target)

    def test_manifest_read_remains_bounded_if_file_grows_after_stat(self):
        with tempfile.TemporaryDirectory() as folder:
            target=Path(folder)/'pack';shutil.copytree(PACK,target)
            manifest=target/'manifest.json';raw=manifest.read_bytes()
            manifest.write_bytes(raw+b' '*131073)
            original_stat=Path.stat
            def stale_stat(path,*args,**kwargs):
                result=original_stat(path,*args,**kwargs)
                if path==manifest:
                    values=list(result);values[6]=len(raw)
                    return os.stat_result(values)
                return result
            with mock.patch.object(Path,'stat',new=stale_stat):
                with self.assertRaisesRegex(ValueError,'byte budget'):
                    events.load_event_pack(target)

if __name__=='__main__':unittest.main()
