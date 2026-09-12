"""Shared v3 schema/semantics and strict JSON cases; fixtures are not accuracy truth."""
import copy
import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools"))
import validate_ephemeris_snapshot as validator


def parent(data, path):
    keys = path.split(".")
    for key in keys[:-1]:
        data = data[int(key)] if isinstance(data, list) else data[key]
    return data, keys[-1]


class V3Tests(unittest.TestCase):
    def test_shared_corpus(self):
        corpus = json.loads((ROOT / "tests/fixtures/ephemeris-v3-corpus.json").read_text())
        for case in corpus["cases"]:
            with self.subTest(case=case["name"]):
                data = copy.deepcopy(corpus["snapshot"])
                for path, value in case["changes"]:
                    node, key = parent(data, path)
                    node[key] = value
                if "remove" in case:
                    node, key = parent(data, case["remove"])
                    del node[key]
                errors = validator.validate(data)
                self.assertEqual(not errors, case["valid"], errors)

    def test_strict_json(self):
        for text in ['{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}', '{"a":1} trailing']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                validator.parse_snapshot(text)


if __name__ == "__main__":
    unittest.main()
