from __future__ import annotations

import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.species_grid import (
    PRECOMPUTED_GRID_CSV_PATH,
    build_species_grid_dataframe,
    save_species_grid_csv,
)


def main() -> None:
    df = build_species_grid_dataframe()
    save_species_grid_csv(df)
    print(f"Wrote precomputed species grid to {PRECOMPUTED_GRID_CSV_PATH}")


if __name__ == "__main__":
    main()
