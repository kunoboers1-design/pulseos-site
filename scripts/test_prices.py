#!/usr/bin/env python3
"""Controleer CSV-import, grensgevallen en publieke gegevens tegen de bron."""

import csv
from decimal import Decimal
import json
import os
from pathlib import Path
import tempfile
import unittest

from import_prices import OUTPUT, SOURCES, read_sources


# MARK: - Gegevenscontroles
# Comment NL: Onafhankelijke vergelijking leest ieder publiek bedrag opnieuw uit de bronrij.
class PriceTests(unittest.TestCase):
    def test_every_source_price(self):
        directory = Path(os.environ.get("PRICE_SOURCE_DIR", str(Path.home() / "Downloads")))
        data = json.loads(OUTPUT.read_text())
        self.assertEqual(set(data), {"importedAt", "regions", "products"})
        self.assertEqual(set(data["products"]), {app for _, app, _ in SOURCES})
        total = 0
        for filename, app, plan in SOURCES:
            with (directory / filename).open(encoding="utf-8-sig", newline="") as source:
                rows = list(csv.DictReader(source))
            prices = data["products"][app][plan]
            self.assertEqual(len(prices), len(rows))
            for row in rows:
                actual = prices[row["Countries or Regions"]]
                self.assertEqual(set(actual), {"price", "currency"})
                self.assertEqual(actual["currency"], row["Currency Code"])
                self.assertEqual(Decimal(actual["price"]), Decimal(row["Price"]))
                total += 1
        self.assertEqual(total, sum(len(p) for plans in data["products"].values() for p in plans.values()))
        expected = {
            "pulserecipes": {"lifetime": "14.99"},
            "pulsevinyl": {"monthly": "9.99", "yearly": "34.99", "lifetime": "59.99"},
            "pulsefx": {"monthly": "8.99", "yearly": "69.99", "lifetime": "109.99"},
            "pulsereflect": {"lifetime": "4.99"}, "pulsewiish": {"lifetime": "4.99"},
        }
        for app, plans in expected.items():
            self.assertEqual(set(data["products"][app]), set(plans))
            for plan, price in plans.items():
                self.assertEqual(data["products"][app][plan]["Netherlands"], {"currency": "EUR", "price": price})

    def make_sources(self, directory, rows):
        for filename, _, _ in SOURCES:
            with (directory / filename).open("w", newline="") as output:
                writer = csv.writer(output)
                writer.writerow(["Price", "Proceeds", "Countries or Regions", "Currency Code"])
                writer.writerows(rows)

    def test_quoted_regions_reordered_columns_and_allowlist(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            self.make_sources(directory, [["14.99", "PRIVATE", "Bonaire, Sint Eustatius and Saba", "USD"]])
            (directory / "Lauch offer pulsevinyl.csv").write_text("must never be parsed")
            data, report = read_sources(directory)
            self.assertEqual(data["regions"], ["Bonaire, Sint Eustatius and Saba"])
            self.assertEqual(report["totalPrices"], 9)
            self.assertNotIn("PRIVATE", json.dumps(data))

    def test_missing_combinations_are_reported(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            self.make_sources(directory, [["14.99", "PRIVATE", "Netherlands", "EUR"]])
            with (directory / SOURCES[0][0]).open("a") as source:
                source.write("12.99,PRIVATE,United States,USD\n")
            _, report = read_sources(directory)
            self.assertEqual(len(report["missingCombinations"]), 8)

    def test_invalid_values_and_duplicates_fail(self):
        valid = ["14.99", "PRIVATE", "Netherlands", "EUR"]
        for rows in [[valid, valid], [["", "PRIVATE", "Netherlands", "EUR"]],
                     [["NaN", "PRIVATE", "Netherlands", "EUR"]],
                     [["-1", "PRIVATE", "Netherlands", "EUR"]],
                     [["1,99", "PRIVATE", "Netherlands", "EUR"]],
                     [["14.99", "PRIVATE", "", "EUR"]],
                     [["14.99", "PRIVATE", "Netherlands", ""]]]:
            with self.subTest(rows=rows), tempfile.TemporaryDirectory() as temporary:
                directory = Path(temporary)
                self.make_sources(directory, rows)
                with self.assertRaises(ValueError):
                    read_sources(directory)


if __name__ == "__main__":
    unittest.main()
