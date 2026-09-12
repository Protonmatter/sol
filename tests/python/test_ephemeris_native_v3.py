"""Fresh native producer -> the same Python and Node v3 intake used for the corpus."""
import json
import math
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import validate_ephemeris_snapshot as validator


class NativeV3Tests(unittest.TestCase):
    def test_native_hybrid_cannot_combine_different_instants_in_one_day(self):
        snapshots = []
        for jd in [2461222.6,2461222.725]:
            text = subprocess.run(["cargo","run","--quiet","--locked","-p","solar-ephemeris","--example","snapshot","--",str(jd),"0","0","0"],cwd=ROOT,check=True,capture_output=True,text=True).stdout
            data = validator.parse_snapshot(text)
            self.assertEqual(validator.validate(data),[])
            snapshots.append(data)
        snapshots[0]["bodies"] = [b for b in snapshots[0]["bodies"] if b["range_approximation"] != "infinite_catalogue_star"]
        self.assertEqual(validator.validate(snapshots[0]),[])
        self.assertEqual(snapshots[0]["events_window"],snapshots[1]["events_window"])
        check = subprocess.run(["node","--input-type=module","-e","import fs from 'node:fs'; import assert from 'node:assert/strict'; import {assertEphemerisSnapshotV3,mergeLocalEvents} from './apps/web/js/ephemerisContract.js'; const [remote,local]=JSON.parse(fs.readFileSync(0,'utf8')); assertEphemerisSnapshotV3(remote); assertEphemerisSnapshotV3(local); assert.throws(()=>mergeLocalEvents(remote,local),/epoch/i);"],input=json.dumps(snapshots),cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(check.returncode,0,check.stderr)

    def test_fresh_native_snapshots_in_both_live_readers(self):
        for jd, lat, lon in [(2461222.5929050925,0,0), (2299160.5,90,120), (1721425.5,-90,-71.060000001)]:
            with self.subTest(jd=jd,lat=lat,lon=lon):
                text = subprocess.run(["cargo","run","--quiet","--locked","-p","solar-ephemeris","--example","snapshot","--",str(jd),str(lat),str(lon),"0"],cwd=ROOT,check=True,capture_output=True,text=True).stdout
                data = validator.parse_snapshot(text)
                self.assertEqual(validator.validate(data),[])
                self.assertEqual(data["observer"]["terrestrial_lon_deg_east"],lon)
                for name, radius in [("Sun",695700.0),("Moon",1737.4)]:
                    body = next(b for b in data["bodies"] if b["name"] == name)
                    self.assertAlmostEqual(body["angular_size_arcsec"],2*math.degrees(math.asin(radius/body["observer_range_km"]))*3600,delta=0.000051)
                    self.assertAlmostEqual(body["horizontal_parallax_deg"],math.degrees(math.asin(6378.14/body["geocentric_range_km"])),delta=0.00000000051)
                check = subprocess.run(["node","--input-type=module","-e","import fs from 'node:fs'; import {parseEphemerisSnapshot} from './apps/web/js/ephemerisContract.js'; parseEphemerisSnapshot(fs.readFileSync(0,'utf8'));"],input=text,cwd=ROOT,capture_output=True,text=True)
                self.assertEqual(check.returncode,0,check.stderr)


if __name__ == "__main__":
    unittest.main()
