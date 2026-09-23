"""Analytic cell-integrated Gaussian mass, alignment, clipping and arc regressions."""
import math
from pathlib import Path
import sys
import struct
import unittest

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tools'))
from solar_gaussian_deposition import gaussian_cell_contributions, deposit_line_segment, SUPPORT_MASS_FRACTION


class SolarDepositionTests(unittest.TestCase):
    def test_narrow_wide_phase_and_resolution_preserve_unclipped_mass(self):
        for n in (64,96):
            h=5/n
            for width in (.005,.02,.05):
                for yz in (0.,h/2):
                    with self.subTest(n=n,width=width,yz=yz):
                        local={};accounting=deposit_line_segment(local,[1.45,yz,yz,width],[1.75,yz,yz,width],n,1.,0.,clip_shell=False);target=accounting.target_mass
                        measured=math.fsum(value[0] for value in local.values())*h**3
                        self.assertAlmostEqual(measured/target,SUPPORT_MASS_FRACTION,places=11)
                        self.assertLess(abs(measured/target-1),2e-6)
                        self.assertAlmostEqual(accounting.retained_mass,measured,places=15)
                        self.assertLess(accounting.clipped_mass/target,1e-11)

    def test_boundary_clipping_only_removes_cells_without_renormalizing(self):
        for n in (64,96):
            for center in ([1.,0.,0.],[2.49/math.sqrt(2),2.49/math.sqrt(2),0.]):
                with self.subTest(n=n,center=center):
                    full=dict(gaussian_cell_contributions(center,.05,n,1.,clip_shell=False))
                    clipped=dict(gaussian_cell_contributions(center,.05,n,1.,clip_shell=True))
                    self.assertTrue(clipped);self.assertLess(len(clipped),len(full))
                    for index,value in clipped.items():self.assertEqual(value,full[index])
                    fraction=math.fsum(clipped.values())*(5/n)**3
                    self.assertGreater(fraction,.1);self.assertLess(fraction,.9)

    def test_accounting_distinguishes_tails_and_box_shell_losses(self):
        for n in (64,96):
            for radius in (1.,2.49):
                local={};mass=deposit_line_segment(local,[radius,-.01,0.,.05],[radius,.01,0.,.05],n,1.,0.)
                self.assertGreater(mass.target_mass,0.);self.assertGreater(mass.clipped_mass,0.)
                self.assertAlmostEqual(mass.tail_mass/mass.target_mass,1-SUPPORT_MASS_FRACTION,places=14)
                self.assertAlmostEqual(mass.target_mass,mass.retained_mass+mass.tail_mass+mass.clipped_mass,places=14)
                self.assertAlmostEqual(math.fsum(v[0] for v in local.values())*(5/n)**3,mass.retained_mass,places=14)

    def test_float32_caller_storage_does_not_restore_large_phase_bias(self):
        f32=lambda value:struct.unpack('<f',struct.pack('<f',value))[0]
        for n in (64,96):
            for yz in (0.,2.5/n):
                local={};budget=deposit_line_segment(local,[1.2,yz,yz,.005],[1.7,yz,yz,.005],n,1.,0.)
                # Constant background is caller-owned; subtract its encoded
                # representation as in the supplied volume diagnostic.
                measured=math.fsum(f32(.015+value[0])-f32(.015) for value in local.values())*(5/n)**3
                self.assertLess(abs(measured/budget.target_mass-1),2e-5)

    def test_target_mass_matches_independent_gain_and_altitude_quadrature(self):
        n=96;a=[1.3,.02,.03,.01];b=[1.7,.02,.03,.03];emission=.7;ga=.2;gb=1.4;local={}
        result=deposit_line_segment(local,a,b,n,emission,2.,gain_a=ga,gain_b=gb,clip_shell=False)
        length=math.dist(a[:3],b[:3]);pieces=math.ceil(length/((5/n)*.5));expected=[]
        for k in range(pieces):
            t=(k+.5)/pieces;p=[a[i]+(b[i]-a[i])*t for i in range(3)];alt=max(0.,math.sqrt(sum(v*v for v in p))-1)
            expected.append(emission*(length/pieces)*2*math.pi*.02**2*math.exp(-alt/.3)*(ga*(1-t)+gb*t))
        self.assertAlmostEqual(result.target_mass,math.fsum(expected),places=16)
        self.assertEqual(result.samples,pieces)

    def test_duplicate_linearity_background_absence_and_weighted_arc(self):
        n=64;local={};a=[1.3,.04,.04,.02];b=[1.7,.04,.04,.02]
        target=deposit_line_segment(local,a,b,n,.5,3.,gain_a=.25,gain_b=1.)
        first=dict(local);again=deposit_line_segment(local,a,b,n,.5,3.,gain_a=.25,gain_b=1.)
        self.assertEqual(target,again);self.assertTrue(local)
        for index,(density,weighted_arc) in local.items():
            self.assertAlmostEqual(density,2*first[index][0],places=13)
            self.assertAlmostEqual(weighted_arc,2*first[index][1],places=13)
            self.assertGreaterEqual(weighted_arc/density,3.);self.assertLessEqual(weighted_arc/density,3.4)
        empty={};self.assertEqual(deposit_line_segment(empty,a,a,n,1.,0.).target_mass,0.);self.assertEqual(empty,{})
        self.assertEqual(list(gaussian_cell_contributions([1.5,0.,0.],.02,n,0.)),[])

    def test_cell_integrals_match_independent_single_voxel_cdf(self):
        n=64;h=5/n;position=[1.5,.01,-.02];sigma=.02;mass=.3
        result=dict(gaussian_cell_contributions(position,sigma,n,mass,clip_shell=False))
        x,y,z=[math.floor((p+2.5)/h) for p in position];index=(z*n+y)*n+x
        probability=1.
        for axis,cell in enumerate((x,y,z)):
            lo=max(-2.5+cell*h,position[axis]-5*sigma);hi=min(-2.5+(cell+1)*h,position[axis]+5*sigma)
            probability*=.5*(math.erf((hi-position[axis])/(math.sqrt(2)*sigma))-math.erf((lo-position[axis])/(math.sqrt(2)*sigma)))
        self.assertAlmostEqual(result[index],mass*probability/h**3,places=12)

    def test_invalid_inputs_fail_before_accumulation(self):
        for sigma in (0.,-.1,float('nan'),float('inf'),1.):
            with self.subTest(sigma=sigma),self.assertRaises(ValueError):list(gaussian_cell_contributions([1.5,0.,0.],sigma,64,1.))
        for n in (0,129,64.5,True):
            with self.subTest(n=n),self.assertRaises(ValueError):list(gaussian_cell_contributions([1.5,0.,0.],.02,n,1.))
        for kwargs in ({'gain_a':-1.},{'gain_b':float('nan')}):
            local={}
            with self.assertRaises(ValueError):deposit_line_segment(local,[1.3,0.,0.,.02],[1.5,0.,0.,.02],64,1.,0.,**kwargs)
            self.assertEqual(local,{})

    def test_old_center_sampling_counterexample_is_not_roundoff(self):
        # Independent isolated reference of the former point-center quadrature.
        ratios=[]
        for n in (64,96):
            h=5/n;width=.005;sigma=math.sqrt(width*width+h*h/12)
            for yz in (h/2,0.):
                ds=.5;pieces=math.ceil(ds/(h*.5));target=0.;terms=[]
                for k in range(pieces):
                    p=[1.2+ds*(k+.5)/pieces,yz,yz];alt=max(0.,math.sqrt(sum(v*v for v in p))-1)
                    mass=ds/pieces*2*math.pi*width**2*math.exp(-alt/.3);target+=mass
                    axes=[range(max(0,math.ceil((v-3*sigma+2.5)/h-.5)),min(n,math.floor((v+3*sigma+2.5)/h-.5)+1)) for v in p]
                    for z in axes[2]:
                        for y in axes[1]:
                            for x in axes[0]:
                                delta=[-2.5+(c+.5)*h-p[i] for i,c in enumerate((x,y,z))]
                                terms.append(mass/((2*math.pi)**1.5*sigma**3)*math.exp(-sum(d*d for d in delta)/(2*sigma*sigma))*h**3)
                ratios.append(math.fsum(terms)/target)
        for actual,expected in zip(ratios,(1.85918354,.42612875,1.72685069,.46363021)):
            self.assertAlmostEqual(actual,expected,places=6)

if __name__=='__main__':unittest.main()
