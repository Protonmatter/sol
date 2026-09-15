"""Offline admission contracts for dated display rasters, using synthetic pixels only."""
from copy import deepcopy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("mapped_reference_validator", ROOT / "tools/validate_visual_assets.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)


def png(color_type=6):
    """A valid 4x2 PNG fixture; no observational identity is asserted by this test."""
    def chunk(kind, value):
        return struct.pack(">I", len(value)) + kind + value + struct.pack(">I", zlib.crc32(kind + value))
    channels = {2: 3, 6: 4}[color_type]
    raw = b"".join(b"\0" + bytes([32, 64, 128, 255][:channels]) * 4 for _ in range(2))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 4, 2, 8, color_type, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def reference(raw=None):
    raw = png() if raw is None else raw
    return {
        "id": "synthetic-earth-surface", "body": "Earth", "role": "surface",
        "path": "textures/reference/synthetic.png", "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
        "dimensions": [4, 2], "label": "Synthetic test reference", "credits": "Unit test synthetic fixture",
        "source_url": "https://example.nasa.gov/test/source.png", "source_sha256": hashlib.sha256(raw).hexdigest(),
        "source_bytes": len(raw), "source_retrieved_at": "2026-09-13T00:00:00Z", "reviewed_at": "2026-09-13T01:00:00Z",
        "observation_label": "Synthetic fixture epoch 2020-2021", "color_interpretation": "Synthetic sRGB display colors",
        "limitations": "No observed or calibrated science; synthetic test fixture only", "projection": "equirectangular",
        "mapping": {"primeMeridianU": .5, "longitudeDirection": "east", "latitudeType": "planetographic", "latitudeBounds": [-90, 90]},
        "validLatitudeBounds": [-90, 90], "nodata": "none", "derivation": "Original bytes",
        "metadata_urls": ["https://science.nasa.gov/test/product-description"],
    }


class MappedReferenceTests(unittest.TestCase):
    def validate(self, entry=None, web_root=None, *, earth_base=False):
        entries = [reference() if entry is None else entry]
        if earth_base:
            base = reference(); base.update(id="synthetic-earth-base", path="textures/reference/base.png")
            entries.insert(0, base)
        return mod.validate_mapped_references({"mapped_references": entries}, web_root)

    def test_absent_collection_is_backward_compatible_but_present_collection_is_strict(self):
        self.assertEqual(mod.validate_mapped_references({}), (set(), set()))
        for invalid in (None, {}, "[]", True):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                mod.validate_mapped_references({"mapped_references": invalid})
        for invalid in (None, [], "record"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                self.validate(invalid if invalid is not None else {})

    def test_original_and_all_dated_roles_are_admitted_without_changing_legacy_holds(self):
        for role in ("surface", "night-lights", "cloud-composite", "weather", "sea-ice"):
            item = reference(); item["role"] = role
            if role in ("cloud-composite", "weather", "sea-ice"): item["nodata"] = "alpha"
            ids, paths = self.validate(item, earth_base=role != "surface")
            self.assertIn(item["id"], ids); self.assertIn(item["path"], paths)
        data = json.loads((ROOT / "apps/web/visual-assets.v1.json").read_text(encoding="utf-8"))
        before = deepcopy(data["assets"])
        data["mapped_references"] = [reference()]
        mod.validate_inventory(data)
        self.assertEqual(data["assets"], before)
        with self.assertRaisesRegex(ValueError, "qualification"):
            mod.validate_inventory(data, require_qualified=True)
        data["mapped_references"][0]["id"] = data["assets"][0]["id"]
        with self.assertRaisesRegex(ValueError, "across raster collections"):
            mod.validate_inventory(data)

    def test_every_required_field_is_required_and_unknown_claims_are_rejected(self):
        for field in sorted(mod.MAPPED_REFERENCE_FIELDS):
            item = reference(); del item[field]
            with self.subTest(field=field), self.assertRaises(ValueError): self.validate(item)
        for field in ("live", "calibrated", "global_mapping_allowed"):
            item = reference(); item[field] = True
            with self.subTest(field=field), self.assertRaises(ValueError): self.validate(item)

    def test_explicit_moon_color_mode_is_bounded_to_the_qualified_io_surface(self):
        item = reference(); item.update(body="Io", moon_color_mode="source-rgb")
        self.validate(item)
        for changes in ({"moon_color_mode": None}, {"moon_color_mode": []},
                        {"moon_color_mode": "natural"}, {"moon_color_mode": True},
                        {"body": "Europa"}, {"body": "Earth"}, {"role": "weather"}):
            bad = deepcopy(item); bad.update(changes)
            with self.subTest(changes=changes), self.assertRaisesRegex(ValueError, "moon color mode"):
                self.validate(bad)

    def test_invalid_and_unhashable_values_fail_with_actionable_value_errors(self):
        cases = [(field, value) for field in ("id", "body", "role", "path", "nodata", "projection", "sha256", "source_sha256", "label", "credits")
                 for value in (None, [], {}, True)]
        cases += [(field, value) for field in ("bytes", "source_bytes") for value in (0, -1, True, 1.5, float("nan"))]
        cases += [("dimensions", value) for value in (None, [], [4], [4, 0], [True, 2], [4, 2.0])]
        for field, value in cases:
            item = reference(); item[field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError): self.validate(item)

    def test_duplicate_id_path_and_body_role_are_rejected(self):
        for same in ("id", "path", "role"):
            a = reference(); b = deepcopy(a); b.update(id="different", path="textures/reference/different.png", role="weather")
            b[same] = a[same]
            with self.subTest(same=same), self.assertRaisesRegex(ValueError, "duplicate"):
                mod.validate_mapped_references({"mapped_references": [a, b]})

    def test_paths_cannot_escape_reference_directory_or_accept_unknown_formats(self):
        for value in ("textures/a.png", "textures/reference/../a.png", "textures/reference/sub/a.png", "C:/a.png", "textures/reference/a.webp", "textures/reference/a.png?x"):
            item = reference(); item["path"] = value
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "path"): self.validate(item)

    def test_coordinate_conventions_bounds_and_pixel_center_window_are_explicit(self):
        for direction in ("east", "west"):
            for latitude in ("planetographic", "planetocentric", "parametric"):
                item = reference(); item["mapping"].update(longitudeDirection=direction, latitudeType=latitude,
                    latitudeBounds=[-80, 75], uvScale=[.9, .8], uvOffset=[.05, .1])
                item["validLatitudeBounds"] = [-70, 60]; item["nodata"] = "alpha"
                self.validate(item)
        item = reference(); item["mapping"].update(uvScale=[1.0000047158519485, 1], uvOffset=[0, 0]); self.validate(item)
        item["mapping"].update(uvScale=[1, 1], uvOffset=[-.01, 0]); self.validate(item)
        cases = [("primeMeridianU", value) for value in (True, -1, 1.1, None, float("nan"), float("inf"))]
        cases += [(key, value) for key in ("longitudeDirection", "latitudeType") for value in ([], {}, None, "unknown")]
        cases += [("latitudeBounds", value) for value in ([], [-91, 90], [-90, 91], [0, 0], [30, -30], [True, 90], [-90, float("nan")])]
        cases += [(key, value) for key in ("uvScale", "uvOffset") for value in (None, [], [1], [float("inf"), 1], [True, .2])]
        cases += [("uvScale", [0, 1]), ("uvScale", [-.1, 1]), ("uvOffset", [1, 0]), ("uvOffset", [-1, 0]), ("unknown", 1)]
        for key, value in cases:
            item = reference(); item["mapping"][key] = value
            with self.subTest(key=key, value=value), self.assertRaises(ValueError): self.validate(item)
        for value in (None, {}, [], {"primeMeridianU": .5}):
            item = reference(); item["mapping"] = value
            with self.subTest(value=value), self.assertRaises(ValueError): self.validate(item)
        item = reference(); item["mapping"]["latitudeBounds"] = [-80, 80]
        with self.assertRaisesRegex(ValueError, "coverage exceeds"): self.validate(item)

    def test_source_hosts_are_official_and_metadata_exception_cannot_fetch_bytes(self):
        for host in ("nasa.gov", "svs.gsfc.nasa.gov", "usgs.gov", "astrogeology.usgs.gov"):
            item = reference(); item["source_url"] = "https://" + host + "/source.png"; self.validate(item)
        invalid = ["http://nasa.gov/a", "https://nasa.gov.evil.test/a", "https://evilnasa.gov/a", "https://nasa.gov@evil.test/a",
                   "https://user@nasa.gov/a", "https://nasa.gov:4430/a", "https://nasa.gov:bad/a", "https://nasa-gibs.github.io/a",
                   "https://outerplanets.stsci.edu.evil.test/a", " https://nasa.gov/a", "https://nasa.gov/a\n", [], None]
        for url in invalid:
            item = reference(); item["source_url"] = url
            with self.subTest(url=url), self.assertRaisesRegex(ValueError, "official HTTPS"): self.validate(item)
        item = reference(); item["metadata_urls"] = ["https://nasa-gibs.github.io/gibs-api-docs/python-usage/"]; self.validate(item)
        for metadata in ([], None, {}, ["https://example.org/info"], [None]):
            item = reference(); item["metadata_urls"] = metadata
            with self.subTest(metadata=metadata), self.assertRaises(ValueError): self.validate(item)

    def test_stsci_archive_bytes_require_nasa_mission_metadata(self):
        for archive in ("archive.stsci.edu", "outerplanets.stsci.edu"):
            item = reference(); item["source_url"] = "https://" + archive + "/test.png"; self.validate(item)
            item["metadata_urls"] = ["https://" + archive + "/metadata"]
            with self.assertRaisesRegex(ValueError, "NASA mission evidence"): self.validate(item)

    def test_date_provenance_rejects_missing_timezone_reversed_review_and_hidden_live_claims(self):
        for field in ("source_retrieved_at", "reviewed_at"):
            for value in (None, "", "2026-09-13", "invalid", "2026-09-99T00:00:00Z"):
                item = reference(); item[field] = value
                with self.subTest(field=field, value=value), self.assertRaises(ValueError): self.validate(item)
        item = reference(); item["reviewed_at"] = "2026-09-12T00:00:00Z"
        with self.assertRaisesRegex(ValueError, "precedes"): self.validate(item)
        for value in ("undated", "Current weather 2026", "2026 live", "real-time 2026", "today 2026", "now 2026"):
            item = reference(); item["observation_label"] = value
            with self.subTest(value=value), self.assertRaises(ValueError): self.validate(item)
        item = reference(); item["label"] = "Live weather"
        with self.assertRaisesRegex(ValueError, "current observations"): self.validate(item)

    def test_derivation_binds_all_inputs_and_primary_byte_identity(self):
        item = reference(); item.update(source_sha256="a" * 64, source_bytes=1000, derivation="Synthetic RGBA fixture from source RGB and mask")
        primary = {"url": item["source_url"], "sha256": item["source_sha256"], "bytes": item["source_bytes"]}
        secondary = {"url": "https://gibs.earthdata.nasa.gov/test/mask.png", "sha256": "b" * 64, "bytes": 500}
        item["derivation_inputs"] = [primary, secondary]; self.validate(item)
        for bad in (None, [], {}, [secondary], [primary, primary], [primary, {}], [primary, {**secondary, "sha256": "bad"}],
                    [primary, {**secondary, "bytes": True}], [primary, {**secondary, "url": "https://example.org/mask"}]):
            candidate = deepcopy(item); candidate["derivation_inputs"] = bad
            with self.subTest(bad=bad), self.assertRaises(ValueError): self.validate(candidate)
        candidate = deepcopy(item); candidate["derivation_inputs"][1]["url"] = "https://archive.stsci.edu/test.png"
        candidate["metadata_urls"] = ["https://nasa-gibs.github.io/gibs-api-docs/"]
        with self.assertRaisesRegex(ValueError, "NASA mission evidence"): self.validate(candidate)
        item = reference(); item["source_bytes"] += 1
        with self.assertRaisesRegex(ValueError, "inconsistent size"): self.validate(item)
        item = reference(); item["source_sha256"] = "a" * 64
        with self.assertRaisesRegex(ValueError, "processing description"): self.validate(item)

    def test_raster_inventory_binds_bytes_dimensions_alpha_and_nested_files(self):
        with tempfile.TemporaryDirectory(prefix="sol-mapped-reference-") as directory:
            root = Path(directory); target = root / "textures/reference/synthetic.png"; target.parent.mkdir(parents=True)
            target.write_bytes(png()); self.validate(web_root=root)
            for field, value in (("sha256", "a" * 64), ("bytes", 1), ("dimensions", [8, 4])):
                item = reference(); item[field] = value
                if field == "bytes": item["source_bytes"] = value
                if field == "sha256": item["source_sha256"] = value
                with self.subTest(field=field), self.assertRaisesRegex(ValueError, "differ from inventory"): self.validate(item, root)
            item = reference(); item["nodata"] = "alpha"; self.validate(item, root)
            target.write_bytes(png(2)); item = reference(png(2)); item["nodata"] = "alpha"
            with self.assertRaisesRegex(ValueError, "alpha raster"): self.validate(item, root)
            target.write_bytes(png()); nested = target.parent / "unlisted"; nested.mkdir(); (nested / "unknown.bin").write_bytes(b"not a raster")
            with self.assertRaisesRegex(ValueError, "inventory incomplete"): self.validate(web_root=root)
            target.unlink()
            with self.assertRaisesRegex(ValueError, "missing mapped"): self.validate(web_root=root)

    def test_format_headers_are_not_inferred_from_suffix_or_missing_alpha(self):
        for raw, suffix, nodata in ((b"not png", ".png", "none"), (png(), ".jpg", "none"), (png(), ".webp", "none"), (b"", ".jpg", "alpha")):
            with self.subTest(suffix=suffix, nodata=nodata), self.assertRaises(ValueError):
                mod.reference_raster_dimensions(raw, suffix, nodata)
        jpeg = (ROOT / "apps/web/textures/earth.jpg").read_bytes()
        dimensions = mod.reference_raster_dimensions(jpeg, ".jpg", "none")
        self.assertTrue(all(number > 0 for number in dimensions))

    def test_original_palette_legend_is_bound_to_same_origin_bytes_and_sea_ice(self):
        item = reference(); item.update(role="sea-ice", nodata="alpha")
        legend = {"path": "images/sea-ice-legend.png", "sha256": item["sha256"], "bytes": item["bytes"],
                  "dimensions": [4, 2], "source_url": "https://gibs.earthdata.nasa.gov/legends/test.png"}
        item["legend"] = legend
        with tempfile.TemporaryDirectory(prefix="sol-reference-legend-") as directory:
            root = Path(directory); raster = root / item["path"]; raster.parent.mkdir(parents=True); raster.write_bytes(png())
            (raster.parent / "base.png").write_bytes(png())
            target = root / legend["path"]; target.parent.mkdir(); target.write_bytes(png()); self.validate(item, root, earth_base=True)
            for field, value in (("sha256", "a" * 64), ("bytes", 2), ("dimensions", [8, 4])):
                candidate = deepcopy(item); candidate["legend"][field] = value
                with self.subTest(field=field), self.assertRaisesRegex(ValueError, "legend .*differ from inventory"):
                    self.validate(candidate, root, earth_base=True)
            target.unlink()
            with self.assertRaisesRegex(ValueError, "missing mapped reference legend"): self.validate(item, root, earth_base=True)
        candidate = deepcopy(item); candidate["role"] = "weather"
        with self.assertRaisesRegex(ValueError, "sea-ice role"): self.validate(candidate)
        for field in legend:
            candidate = deepcopy(item); del candidate["legend"][field]
            with self.subTest(field=field), self.assertRaises(ValueError): self.validate(candidate)
        for field, value in (("path", "../legend.png"), ("path", []), ("sha256", {}), ("bytes", True),
                             ("dimensions", [True, 2]), ("source_url", "https://example.org/legend.png")):
            candidate = deepcopy(item); candidate["legend"][field] = value
            with self.subTest(field=field, value=value), self.assertRaises(ValueError): self.validate(candidate)

    def test_earth_auxiliaries_require_base_and_identical_full_grid_and_mask_policy(self):
        def collection():
            base = reference(); entries = [base]
            for role, nodata in (("night-lights", "none"), ("weather", "alpha"), ("sea-ice", "alpha"), ("cloud-composite", "alpha")):
                layer = reference(); layer.update(id="synthetic-" + role, role=role, nodata=nodata,
                    path="textures/reference/" + role + ".png")
                entries.append(layer)
            return {"mapped_references": entries}
        data = collection(); mod.validate_mapped_references(data)
        # Explicit defaults and omitted defaults represent the same image grid.
        for layer in data["mapped_references"][1:]:
            layer["mapping"].update(uvScale=[1.0, 1.0], uvOffset=[0.0, 0.0])
        mod.validate_mapped_references(data)
        data["mapped_references"][0]["mapping"]["primeMeridianU"] = 0
        for layer in data["mapped_references"][1:]: layer["mapping"]["primeMeridianU"] = 1
        mod.validate_mapped_references(data)
        for role_index in range(1, 5):
            data = collection(); layer = data["mapped_references"][role_index]
            with self.subTest(role=layer["role"], missing="surface"), self.assertRaisesRegex(ValueError, "Earth surface"):
                mod.validate_mapped_references({"mapped_references": [layer]})
            for field, value in (("primeMeridianU", .25), ("longitudeDirection", "west"), ("latitudeType", "planetocentric"),
                                 ("uvScale", [.9, 1]), ("uvOffset", [-.01, 0])):
                bad = collection(); bad["mapped_references"][role_index]["mapping"][field] = value
                with self.subTest(role=layer["role"], field=field), self.assertRaisesRegex(ValueError, "Earth.*grid|Earth.*window"):
                    mod.validate_mapped_references(bad)
            bad = collection(); bad["mapped_references"][role_index]["validLatitudeBounds"] = [-80, 80]
            with self.subTest(role=layer["role"], field="validLatitudeBounds"), self.assertRaisesRegex(ValueError, "Earth.*full"):
                mod.validate_mapped_references(bad)
            bad = collection(); bad["mapped_references"][role_index]["body"] = "Mars"
            with self.subTest(role=layer["role"], field="body"), self.assertRaisesRegex(ValueError, "only supported for Earth"):
                mod.validate_mapped_references(bad)
            for policy in ({"none", "alpha", "black"} - {layer["nodata"]}):
                bad = collection(); bad["mapped_references"][role_index]["nodata"] = policy
                with self.subTest(role=layer["role"], nodata=policy), self.assertRaisesRegex(ValueError, "Earth.*nodata"):
                    mod.validate_mapped_references(bad)
        for field, value in (("latitudeBounds", [-80, 80]), ("uvScale", [.9, 1]), ("uvOffset", [-.01, 0])):
            data = collection()
            for layer in data["mapped_references"]:
                layer["mapping"][field] = value
                if field == "latitudeBounds": layer["validLatitudeBounds"] = value
            with self.subTest(shared=field), self.assertRaisesRegex(ValueError, "Earth.*full|Earth.*window"):
                mod.validate_mapped_references(data)
        data = collection(); data["mapped_references"][0]["validLatitudeBounds"] = [-80, 80]
        with self.assertRaisesRegex(ValueError, "Earth.*full"): mod.validate_mapped_references(data)
        # The restriction belongs to the auxiliary shader path, not all source maps.
        base = reference(); base["mapping"].update(latitudeBounds=[-80, 80], uvScale=[.9, 1]); base["validLatitudeBounds"] = [-80, 80]
        self.validate(base)


if __name__ == "__main__":
    unittest.main()
