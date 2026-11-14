"""Typed discrete native-vector evidence; hashes bind provenance, not WASM accuracy."""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import jsonschema_min
import validate_vectors as native
from horizons_vectors import ARCSEC_PER_RADIAN, CASES, EPOCHS, MAXIMUM_ERROR, load_vector_pack

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = Path('apps/web/data/independent-vector-evidence.json')
BINDING = Path('apps/web/js/independentEvidenceBinding.js')
SCHEMA = Path('docs/independent-vector-evidence-v1.schema.json')
REFERENCE = Path('tests/fixtures/horizons-vectors-20261104')
VERSION = 'independent-vector-evidence.v1'
DOMAIN = {'quantity': 'geometric_cartesian_position', 'frame': 'ecliptic_J2000_ICRF_IAU76',
          'units': 'AU', 'time_scale': 'TDB', 'observer_domain': 'body_center',
          'corrections': 'NONE', 'model_argument_policy': 'TT_equal_to_reference_TDB'}
LIMITATIONS = ('Discrete retained samples only, not a continuous accuracy envelope. Native f64 System ABI '
               'measurements only; corresponding WASM source provenance is not numerical WASM qualification. '
               'TT model argument is numerically matched to reference TDB (TT/TDB approximation up to about '
               '2 ms); historical or future UTC/UT1 conversion is not independently qualified. No apparent '
               'place, topocentric observer, velocity, event, refraction or rendered-image qualification. '
               'Barycentric targets and heliocentric/geocentric origins remain explicit.')


def serialize(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + '\n').encode('utf-8')


def sha256(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def digest_inventory(inventory: dict) -> str:
    return sha256((json.dumps(inventory, sort_keys=True, separators=(',', ':'), allow_nan=False) + '\n').encode())


def _unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate evidence JSON key')
        result[key] = value
    return result


def read_json(raw: bytes) -> dict:
    return json.loads(raw, object_pairs_hook=_unique,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError('nonfinite evidence number')))


def validation_hashes(project: Path = ROOT) -> dict:
    names = set(native.validation_hashes()) | {
        'tools/independent_vector_evidence.py', 'tools/generate_independent_vector_evidence.py',
        'tools/validate_independent_vector_evidence.py', 'tools/jsonschema_min.py', SCHEMA.as_posix()}
    return {name: sha256((project / name).read_bytes()) for name in sorted(names)}


def reference_hashes(project: Path = ROOT) -> dict:
    # Admission checks the entire original pack before these identities are trusted.
    load_vector_pack(project / REFERENCE)
    return {path.relative_to(project).as_posix(): sha256(path.read_bytes())
            for path in sorted((project / REFERENCE).iterdir()) if path.is_file()}


def metrics(xyz, reference) -> dict:
    norm, ref_norm = math.hypot(*xyz), math.hypot(*reference)
    if not 0 < norm < math.inf or not 0 < ref_norm < math.inf:
        raise ValueError('evidence vectors must be finite and nonzero')
    u, v = [value / norm for value in xyz], [value / ref_norm for value in reference]
    cross = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
    result = {'relative_vector_norm_arcsec': math.hypot(*(a-b for a, b in zip(xyz, reference))) / ref_norm * ARCSEC_PER_RADIAN,
              'angular_error_arcsec': math.atan2(math.hypot(*cross), sum(a*b for a, b in zip(u, v))) * ARCSEC_PER_RADIAN,
              'radial_error_ppm': (norm/ref_norm-1)*1e6}
    if not all(math.isfinite(value) for value in result.values()):
        raise ValueError('nonfinite evidence metric')
    return result


def build_document(report: dict) -> dict:
    if (report.get('schema_version') != 'geometric-vector-validation.v1'
            or report.get('reference_mode') != 'offline_replay' or report.get('native_command') != native.COMMAND
            or report.get('native_source_sha256') != native.source_hashes()
            or report.get('validation_source_sha256') != native.validation_hashes()):
        raise ValueError('report must be a current retained native-vector comparison')
    references = reference_hashes()
    rows = []
    for row in report['records']:
        target = row['target_id']
        rows.append({**row, 'reference_vector_au': list(row['reference_vector_au']),
                     'native_vector_au': list(row['native_vector_au']),
                     'id': f"horizons-native-{row['case']}-{row['jd_tdb']:.9f}",
                     'returned_target_id': {1: 199, 2: 299}.get(target, target),
                     'raw_response_sha256': references[f"{REFERENCE}/{row['case']}.txt"]})
    sources, validators = report['native_source_sha256'], validation_hashes()
    document = {'schema_version': VERSION, 'method': 'independent_reference', 'execution': 'native_f64_system_abi',
                'domain': DOMAIN.copy(), 'native_command': native.COMMAND, 'native_host': report['host'],
                'native_source_sha256': sources, 'native_source_digest': digest_inventory(sources),
                'validation_source_sha256': validators, 'validation_source_digest': digest_inventory(validators),
                'reference': {'authority': 'NASA/JPL Horizons API', 'ephemeris': 'DE441',
                              'manifest_path': f'{REFERENCE}/manifest.json',
                              'manifest_sha256': report['reference_manifest_sha256']},
                'reference_artifacts_sha256': references,
                'acceptance': {'metric': 'relative_vector_norm_arcsec', 'maximum': MAXIMUM_ERROR,
                               'comparison': '<=', 'arcsec_per_radian': ARCSEC_PER_RADIAN},
                'records': rows, 'limitations': LIMITATIONS}
    validate_document(document)
    return document


def validate_document(document: dict, project: Path = ROOT) -> None:
    errors = jsonschema_min.validate(document, read_json((project / SCHEMA).read_bytes()))
    if errors:
        raise ValueError('invalid independent evidence schema: ' + '; '.join(errors[:5]))
    if project.resolve() != ROOT.resolve():
        # native.source_hashes uses its own repository root. Compare the recorded
        # exact inventory against a fresh capture there, never against caller paths.
        raise ValueError('independent evidence project must be the validator repository')
    for inventory, current in [('native_source', native.source_hashes()), ('validation_source', validation_hashes(project))]:
        recorded = document[inventory + '_sha256']
        if recorded != current or document[inventory + '_digest'] != digest_inventory(current):
            raise ValueError('stale or incomplete ' + inventory + ' evidence binding')
    pack = load_vector_pack(project / REFERENCE)
    references = reference_hashes(project)
    if document['reference_artifacts_sha256'] != references or document['reference']['manifest_sha256'] != pack.manifest_sha256:
        raise ValueError('independent evidence reference provenance differs')
    if document['domain'] != DOMAIN or document['limitations'] != LIMITATIONS or document['native_command'] != native.COMMAND:
        raise ValueError('unsupported evidence domain, limitations or native command')
    for row, (jd, case) in zip(document['records'], ((jd, case) for jd in EPOCHS for case in CASES)):
        key, body, target, center = case
        if (row['id'] != f'horizons-native-{key}-{jd:.9f}' or row['case'] != key or row['body'] != body
                or row['target_id'] != target or row['returned_target_id'] != {1: 199, 2: 299}.get(target, target)
                or row['center_id'] != center or row['jd_tdb'] != jd
                or row['reference_vector_au'] != list(pack.vectors[(key, jd)])
                or row['raw_response_sha256'] != references[f'{REFERENCE}/{key}.txt']):
            raise ValueError('evidence sample identity, epoch, origin or reference differs')
        measured = metrics(row['native_vector_au'], row['reference_vector_au'])
        # Stored metrics derive from these stored f64 vectors; no numerical budget
        # is used as a tolerance for a forged stored measurement.
        if any(row[name] != value for name, value in measured.items()):
            raise ValueError('stored evidence metric differs from retained vectors')
        if row['passed'] is not (measured['relative_vector_norm_arcsec'] <= MAXIMUM_ERROR):
            raise ValueError('stored evidence acceptance outcome differs')


def compare_replay(document: dict, replay: dict) -> None:
    """2e-14 AU/2e-13 relative permits native libm roundoff, not budget drift."""
    if len(document['records']) != len(replay['records']):
        raise ValueError('native replay sample count differs')
    for row, actual in zip(document['records'], replay['records']):
        if row['id'] != actual['id'] or row['passed'] != actual['passed']:
            raise ValueError('native replay identity or acceptance outcome differs')
        if any(not math.isclose(a, b, rel_tol=2e-13, abs_tol=2e-14)
               for a, b in zip(row['native_vector_au'], actual['native_vector_au'])):
            raise ValueError('native replay vectors differ from recorded measurements')
        if abs(row['tt_argument_error_seconds'] - actual['tt_argument_error_seconds']) > 0.0001:
            raise ValueError('native replay argument differs')


def binding_source(raw: bytes, document: dict) -> str:
    binding = {'schemaVersion': VERSION, 'registrySha256': sha256(raw),
               'nativeSourceDigest': document['native_source_digest']}
    return '// Generated by tools/generate_independent_vector_evidence.py; native measurements only.\n' \
        + 'export const INDEPENDENT_EVIDENCE_BINDING = Object.freeze(' \
        + json.dumps(binding, sort_keys=True, separators=(',', ':')) + ');\n'


def validate_receipt_binding(document: dict, receipt: dict) -> None:
    for name, expected in document['native_source_sha256'].items():
        if receipt.get('source_inputs', {}).get(name) != expected:
            raise ValueError('independent native evidence differs from WASM source receipt: ' + name)


def validate_release_binding(project: Path, wasm_root: Path) -> None:
    """Current releases only; callers gate on the independent registry marker.

    Raises ValueError/OSError on stale content. This establishes corresponding
    sources, not native-versus-WASM numerical agreement.
    """
    from wasm_provenance import read_receipt, validate_receipt
    raw = (project / REGISTRY).read_bytes()
    document = read_json(raw)
    validate_document(document, project)
    if (project / BINDING).read_text() != binding_source(raw, document):
        raise ValueError('independent evidence browser binding differs')
    validate_receipt(project, wasm_root)
    receipt, _ = read_receipt(wasm_root)
    validate_receipt_binding(document, receipt)
