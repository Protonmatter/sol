# Source register and evidence boundaries

Research checked on 2026-09-23. These sources ground terminology, physical relationships, observing interpretation and tool capabilities. They do not certify the proposed renderer. Equations and engineering choices in this plan must still pass the listed numerical, source and device tests.

The three user-supplied NASA pages are N01–N03. Instrument documentation and primary modeling papers provide the additional technical depth needed for implementation. Some Blender pages were available through official search-index excerpts while direct retrieval returned a tool fetch error; those limitations are recorded. No community tutorial is treated as an authoritative solar-physics source.

## NASA and observational context

| ID | Primary source | Used for / limitation |
|---|---|---|
| N01 | [NASA Heliophysics](https://science.nasa.gov/heliophysics/) | User-supplied overview; plasma, magnetic activity and the extended solar atmosphere. Opened and reviewed relevant overview sections. Not a renderer specification or forecasting-validation source. |
| N02 | [NASA Sun](https://science.nasa.gov/sun/) | User-supplied Sun/mission context and access to research/imagery. Opened. No current-cycle status is inferred from a historical example. |
| N03 | [NASA The Heliopedia](https://science.nasa.gov/reference/the-heliopedia/) | User-supplied definitions for corona, photosphere, prominences/filaments, reconnection, solar cycle and wind. Opened and reviewed relevant entries. Definitions support layer meanings, not numerical closure relations. |
| N04 | [NASA Sun facts](https://science.nasa.gov/sun/facts/) | Broad structure, size, layers and differential rotation. Opened. Approximate educational values remain distinct from exact nominal conversion constants. |
| N05 | [SDO HMI and AIA channels](https://sdo.gsfc.nasa.gov/data/channels.php) | Instrument bands and nominal temperature associations; HMI continuum/magnetogram distinction. Opened. Typical formation temperatures are not full response functions or pixel-temperature measurements. |
| N06 | [NASA Marshall: Photosphere](https://solarscience.msfc.nasa.gov/surface.shtml) | Visible surface, limb darkening and rotation context, reviewed during the preceding research assessment. Its explanatory model does not supply a calibrated coefficient for every band. |
| N07 | [NASA Marshall: Photospheric features](https://solarscience.msfc.nasa.gov/feature1.shtml) | Granules, supergranules, spots and faculae; scales/lifetimes. Reviewed in the preceding assessment. Granular lifetime definitions vary; use a declared illustrative distribution rather than one exact universal number. |
| N08 | [NSO Inouye first-light observations](https://nso.edu/press-release/inouye-solar-telescope-first-light/) | Real close-up convection morphology and media context, reviewed in the preceding assessment. The initial outreach media have processing/use qualifications and are not calibrated ground truth for every metric. |
| N09 | [NASA coronal-veil research discussion](https://www.nasa.gov/missions/sdo/the-coronal-veil-are-the-suns-magnetic-arches-an-optical-illusion/) | Limits of inferring unique three-dimensional structures from projected coronal brightness. Reviewed in the preceding assessment. Does not imply that all observed loops are illusory. |
| N10 | [SDO data rules](https://sdo.gsfc.nasa.gov/data/rules.php) and [data access](https://sdo.gsfc.nasa.gov/data/dataaccess.php) | Data attribution/access and browse-product boundaries; rules opened, access route checked. Source-specific product metadata and calibration still need admission. |
| N11 | [NASA Comparing Wavelengths](https://science.nasa.gov/photojournal/comparing-wavelengths/) | Inspected 171/304 comparison image in preceding assessment; visual reference, not a common transfer law for both bands. |
| N12 | [ESA Solar Orbiter coronal movie](https://www.esa.int/ESA_Multimedia/Videos/2024/04/The_Sun_s_fluffy_corona_in_exquisite_detail) | Played/inspected previously; local changes, strands, eruption/rain. EUI close-up and displayed video time cannot be equated to AIA full-disk real-time cadence. |
| N13 | [NASA Marshall: Corona](https://solarscience.msfc.nasa.gov/corona.shtml) | White-light versus emission-line/X-ray corona; large-scale structure. Reviewed previously. Supports distinguishing glow from real coronal structure. |

## Quantitative physics and modeling

| ID | Primary source | Used for / limitation |
|---|---|---|
| P01 | [IAU 2015 Resolution B3](https://arxiv.org/abs/1510.07674) and [IAU resolution text](https://www.iau.org/static/resolutions/IAU2015_English.pdf) | Nominal solar radius and effective-temperature conversion constants, confirmed in indexed primary text. Nominal values are definitions for conversion, not a statement that the observed photosphere has no variability. |
| P02 | [ESO Common Pipeline Library: photometric functions](https://www.eso.org/sci/software/cpl/reference/group__cpl__photom.html) | Wavelength/frequency Planck-radiance conventions, checked via official indexed documentation. Formula in the plan is the standard wavelength form; the proposed use is normalized illustrative continuum contrast. |
| P03 | [pfsspy documentation](https://pfsspy.readthedocs.io/en/stable/) and [numerical methods](https://pfsspy.readthedocs.io/en/stable/numerical_method.html) | PFSS method/reference context. Opened; project explicitly reports it is archived and no longer maintained. Not selected as an application dependency. |
| P04 | [Stansby and Verscharen: Test Problems for PFSS Extrapolations](https://arxiv.org/html/2201.07783v1) | Primary analytical harmonic/field-line test strategy. Opened. Its tests motivate independent verification; this plan does not claim its numerical solver is already reproduced. |
| P05 | [Gudiksen et al.: The stellar atmosphere simulation code Bifrost](https://arxiv.org/abs/1105.6306) and [Carlsson et al.: public enhanced-network simulation](https://arxiv.org/abs/1510.07581) | Primary radiation-MHD scope and possible future simulation-derived patches, abstracts checked. No dataset was downloaded, licensed for redistribution here, or qualified. |
| P06 | [CHIANTI user guide](https://www.chiantidatabase.org/cug.html) | Optically thin emissivity/atomic-data conventions, opened. CHIANTI atomic emissivity alone is not an AIA effective-area/calibration response; instrument products are separately required. |
| P07 | [NASA Ames: Modeling the Solar Corona](https://www.nas.nasa.gov/SC19/demos/demo8.html) | Primary NASA description of radiative-MHD work and its substantially larger scope. Checked in indexed source. It does not imply the proposed reduced model reproduces those simulations. |

## Blender, interchange and color

| ID | Official source | Used for / access limitation |
|---|---|---|
| B01 | [Blender for Windows on Arm](https://code.blender.org/2025/08/blender-for-windows-on-arm/) | Official development report describes 4.5 LTS EEVEE/Vulkan improvements. Official indexed text checked; direct web-tool retrieval failed. A local smoke test is still required. |
| B02 | [Blender 4.5 Cycles GPU rendering](https://docs.blender.org/manual/pt/4.5/render/cycles/gpu_rendering.html) | Official listed CUDA/OptiX/HIP/oneAPI/Metal backend families. Indexed manual text checked. Does not establish Adreno Cycles acceleration. |
| B03 | [Blender Volume Coefficients](https://docs.blender.org/manual/id/4.5/render/shader_nodes/shader/volume_coefficients.html) and [4.5 rendering release notes](https://developer.blender.org/docs/release_notes/4.5/rendering/) | Explicit emission/absorption/scattering coefficients. Official indexed text checked; direct English/latest retrieval failed. Verify node/API in the pinned executable. |
| B04 | [Blender Principled Volume](https://docs.blender.org/manual/nl/4.5/render/shader_nodes/shader/volume_principled.html) | Volume emission/absorption/blackbody inputs. Indexed official manual text checked. Fire-oriented blackbody inputs do not model EUV coronal line emission. |
| B05 | [Blender volume objects and OpenVDB](https://docs.blender.org/manual/id/5.0/modeling/volumes/introduction.html) | OpenVDB file/sequence import and its performance limitations. Official indexed text checked; runtime support still version-tested. |
| B06 | [OpenEXR scene-linear representation](https://openexr.com/en/latest/SceneLinear.html) | Official format guidance; file type alone does not enforce scene-linear values. Checked via indexed documentation. Validate known patches and metadata. |
| B07 | [Blender color-management spaces](https://docs.blender.org/manual/en/5.0/render/color_management/color_spaces.html) and [AgX introduction](https://developer.blender.org/docs/release_notes/4.0/color_management/) | Scene-linear work and separate display transforms. Official indexed text checked. AgX preview is not the browser's existing tone map. |
| B08 | [Blender glTF exporter](https://docs.blender.org/manual/en/3.6/addons/import_export/scene_gltf2.html) | Material-system differences and supported image/emission mappings. Official indexed text checked; direct retrieval failed. Validate the actual pinned exporter, not an assumed universal shader translation. |
| B09 | [Blender command-line arguments](https://docs.blender.org/manual/de/5.1/advanced/command_line/arguments.html) | `--disable-autoexec` and Python exception exit-code behavior, official indexed documentation. Confirm exact executable help before running future scripts. |

## Parameter authority ledger

| Parameter/group | Authority in initial implementation |
|---|---|
| Solar radius 6.957e8 m and nominal effective temperature 5772 K | IAU nominal constants, aligned with existing code; source WCS radius remains its own metadata. |
| Differential-rotation coefficients | Existing engine's declared tracer fit; chosen for consistency, not newly calibrated. |
| Granular scale/lifetime distribution | Observational order-of-magnitude context; initial statistical model assumptions, to be reviewed. |
| Limb coefficient u=0.6 at a 550-nm reference | Explicit illustrative design parameter; no instrument-calibrated claim. |
| PFSS source surface 2.5 R and L=32 | Model/numerical configuration choices; convergence and sensitivity need evidence. |
| Density/temperature/heating and kinematic events | Model assumptions unless a qualified simulation product supplies them. |
| Channel palette, exposure, bloom and artistic preview | Display settings; not physical measurements. |
| Memory/fps budgets, numerical thresholds, effort estimates | Proposed engineering targets; not observed performance or accepted qualification. |

Keep source/provider timestamps, retrieval times, scenario times and review dates distinct. Historical sources remain valid for physical relationships but do not establish the current Sun's state or the latest software behavior. Pin exact versions and observations when producing an implementation artifact.
