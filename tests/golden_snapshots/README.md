# Golden snapshots

Add deterministic serialized `SolarState` snapshots here once serde support is introduced.

Required invariants:

- same seed/config/timestep => same active-region sequence
- CPU and GPU kernels stay within configured tolerance
- assimilation correction logs source provenance
