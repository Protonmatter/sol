# Solar ephemeris component notice

The Sol project declares the `solar-ephemeris` component under GNU Lesser General
Public License version 3 only, SPDX `LGPL-3.0-only`. This component declaration
does not change the application's original MIT/Apache terms. Existing original
copyright and permissive notices remain applicable to the material they cover;
this component and its upstream material are not offered solely under those terms.

The VSOP2013/TOP2013 08-big and ELP-MPP02 06-normal inputs correspond to
THRASTRO/ephem.js revision `2f679a1f698b4f20f9579d94da24af51559458ed`.
The upstream generated JavaScript retains this notice:

    (c) 2016-2021 by Marcel Greter

The matching upstream root license is preserved verbatim in
`COPYING.LESSER.LGPL-3.0`. Its GNU GPL version 3 companion is preserved in
`COPYING.GPL-3.0`. `COEFFICIENT-SOURCES.json` records pinned input/output byte
identities and the reconstruction profile. Preferred upstream inputs, the
upstream README and source utilities accompany the crate under `rebuild/`.

The lunar and outer-planet evaluators identify faithful ports of ephem.js
evaluation code; the lunar initializer also identifies copied initialization
logic. This notice therefore covers source/evaluator provenance as well as
numerical inputs. The upstream README's Bureau des Longitudes / IMCCE theory
references are retained attribution leads, not a separate permissive-only grant.

See `SOURCE-REBUILD.md` for source/build materials and the interface-compatible
replacement procedure. These notices and the owner-approved component policy
do not by themselves establish all applicable rights, distribution compliance,
clean-source correspondence or publication authority.
