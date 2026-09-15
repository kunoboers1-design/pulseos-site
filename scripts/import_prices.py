#!/usr/bin/env python3
"""Importeer uitsluitend publieke consumentenprijzen uit de negen toegestane CSV's."""

import argparse
import csv
from datetime import datetime, timezone
from decimal import Decimal
import json
from pathlib import Path
import re

# MARK: - Toegestane bronnen
# Comment NL: Deze expliciete lijst voorkomt het meenemen van andere exports.
SOURCES = (
    ("PulseRecipes.csv", "pulserecipes", "lifetime"),
    ("Pulsevinyl Lifetime.csv", "pulsevinyl", "lifetime"),
    ("1 maand Pulsevinyl.csv", "pulsevinyl", "monthly"),
    ("1 jaar prijzen Pulse vinyl.csv", "pulsevinyl", "yearly"),
    ("PulseFX life time kosten.csv", "pulsefx", "lifetime"),
    ("Pulsefx 1 maand.csv", "pulsefx", "monthly"),
    ("Pulsefx 1 jaar.csv", "pulsefx", "yearly"),
    ("Pulsereflect life time.csv", "pulsereflect", "lifetime"),
    ("Pulsewiish life time.csv", "pulsewiish", "lifetime"),
)
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "prices.json"


# MARK: - Import en validatie
def read_sources(source_dir):
    products, regions, counts = {}, set(), {}
    for filename, app, plan in SOURCES:
        prices = {}
        with (source_dir / filename).open(encoding="utf-8-sig", newline="") as source:
            reader = csv.DictReader(source, strict=True)
            required = {"Countries or Regions", "Currency Code", "Price"}
            if not reader.fieldnames or not required <= set(reader.fieldnames):
                raise ValueError(f"{filename}: required columns missing")
            if len(reader.fieldnames) != len(set(reader.fieldnames)):
                raise ValueError(f"{filename}: duplicate columns")
            for row in reader:
                if None in row or any(value is None for value in row.values()):
                    raise ValueError(f"{filename}:{reader.line_num}: malformed row")
                region, currency, price = (row[key].strip() for key in (
                    "Countries or Regions", "Currency Code", "Price"))
                if not region or not re.fullmatch(r"[A-Z]{3}", currency):
                    raise ValueError(f"{filename}:{reader.line_num}: invalid region/currency")
                if not re.fullmatch(r"\d+(?:\.\d+)?", price) or not 0 <= Decimal(price) <= Decimal("1e12"):
                    raise ValueError(f"{filename}:{reader.line_num}: invalid price")
                if region in prices:
                    raise ValueError(f"{filename}:{reader.line_num}: duplicate region {region}")
                prices[region] = {"currency": currency, "price": price}
        if not prices:
            raise ValueError(f"{filename}: no prices")
        products.setdefault(app, {})[plan] = dict(sorted(prices.items()))
        regions.update(prices)
        counts[f"{app}/{plan}"] = len(prices)
    missing = [f"{app}/{plan}/{region}" for app, plans in products.items()
               for plan, prices in plans.items() for region in sorted(regions - prices.keys())]
    return {"regions": sorted(regions), "products": products}, {
        "counts": counts, "totalPrices": sum(counts.values()), "regions": len(regions),
        "missingCombinations": missing,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--check", action="store_true", help="Compare every public field with the sources without writing")
    args = parser.parse_args()
    data, report = read_sources(args.source_dir)
    if args.check:
        actual = json.loads(OUTPUT.read_text())
        imported_at = actual.pop("importedAt")
        datetime.fromisoformat(imported_at)
        if actual != data:
            raise ValueError("Public dataset differs from source consumer prices; re-import required")
    else:
        data = {"importedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), **data}
        OUTPUT.parent.mkdir(exist_ok=True)
        temporary = OUTPUT.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
        temporary.replace(OUTPUT)
        # Comment NL: Herlezen controleert ook de werkelijk geschreven JSON.
        if json.loads(OUTPUT.read_text()) != data:
            raise ValueError("Written dataset failed verification")
    print(json.dumps({"mode": "check" if args.check else "import", **report}, indent=2))


if __name__ == "__main__":
    main()
