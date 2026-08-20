"""Minimal repository health check."""

from pathlib import Path
import unittest


class RepositoryHealthTest(unittest.TestCase):
    """Verify the project exposes its expected top-level identity."""

    def test_readme_declares_project_name(self) -> None:
        readme = Path(__file__).resolve().parents[1] / "README.md"

        self.assertTrue(readme.is_file(), "README.md should exist")
        self.assertEqual(readme.read_text(encoding="utf-8").splitlines()[0], "# learn_dsh")


if __name__ == "__main__":
    unittest.main()
