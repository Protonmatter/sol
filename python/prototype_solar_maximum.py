#!/usr/bin/env python3
"""Synthetic solar maximum image prototype.

No external dependencies. Writes a binary PPM image.
This is a visualization prototype only; the authoritative math core is Rust.
"""

import argparse
import math
import random


def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def render(width, height, seed, spots):
    rng = random.Random(seed)
    active = []
    for _ in range(spots):
        hemi = -1 if rng.random() < 0.5 else 1
        lat = hemi * max(3, rng.gauss(16, 7))
        lon = rng.uniform(-85, 85)
        area = rng.uniform(0.8, 3.5)
        complexity = rng.uniform(0.3, 1.0)
        active.append((lat, lon, area, complexity))

    pixels = bytearray()
    for y in range(height):
        ny = 2 * (y + 0.5) / height - 1
        for x in range(width):
            nx = 2 * (x + 0.5) / width - 1
            r2 = nx * nx + ny * ny
            if r2 > 1:
                pixels.extend((0, 0, 0))
                continue

            mu = math.sqrt(max(0.0, 1.0 - r2))
            limb = 1.0 - 0.62 * (1.0 - mu)
            gran = 0.025 * math.sin(90 * nx + 13 * math.sin(20 * ny)) * math.sin(75 * ny)
            intensity = limb + gran

            # Approximate visible heliographic coordinates.
            lat = math.degrees(math.asin(max(-1, min(1, ny))))
            lon = math.degrees(math.atan2(nx, mu))

            for alat, alon, area, complexity in active:
                dlat = lat - alat
                dlon = lon - alon
                d2 = dlat * dlat + dlon * dlon
                core = math.exp(-d2 / (2 * (0.8 * area) ** 2))
                pen = math.exp(-d2 / (2 * (1.8 * area) ** 2))
                fac = math.exp(-d2 / (2 * (3.2 * area) ** 2))
                intensity -= 0.75 * core * complexity
                intensity -= 0.30 * max(0, pen - core) * complexity
                intensity += 0.08 * fac * (1 - mu) * complexity

            intensity = max(0.03, min(1.25, intensity))
            # Solar-ish palette.
            red = int(max(0, min(255, 255 * intensity)))
            green = int(max(0, min(255, 170 * intensity)))
            blue = int(max(0, min(255, 55 * intensity)))
            pixels.extend((red, green, blue))
    return pixels


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="synthetic_solar_maximum.ppm")
    parser.add_argument("--width", type=int, default=1024)
    parser.add_argument("--height", type=int, default=1024)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--spots", type=int, default=36)
    args = parser.parse_args()

    pixels = render(args.width, args.height, args.seed, args.spots)
    with open(args.out, "wb") as f:
        f.write(f"P6\n{args.width} {args.height}\n255\n".encode("ascii"))
        f.write(pixels)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
