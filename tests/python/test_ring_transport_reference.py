import math
import unittest
from tools import ring_transport_reference as reference


class RingTransportReferenceTests(unittest.TestCase):
    def test_mixture_counterexample_is_independent_of_slab_equivalence(self):
        for cosine in (1, .5, -.5, .02):
            self.assertEqual(reference.transmission([(0.5, math.inf), (0.5, 0)], cosine), .5)
        self.assertEqual(reference.transmission([(1, math.log(2))], .5), .25)
        self.assertEqual(reference.transmission([(.5, math.log(2)), (.5, 0)], .5, .5), .8125)

    def test_empty_opaque_and_invalid_domain(self):
        self.assertEqual(reference.transmission([(1, 0)], 1), 1)
        self.assertEqual(reference.transmission([(1, math.inf)], .02), 0)
        for regions, cosine in (([(.5, 0)], 1), ([(1, -1)], .5), ([(1, 1)], .001), ([(math.nan, 1)], 1)):
            with self.assertRaises(ValueError): reference.transmission(regions, cosine)


if __name__ == '__main__': unittest.main()
