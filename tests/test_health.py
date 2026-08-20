"""Minimal repository health check. / 最小仓库健康检查。"""

from pathlib import Path
import unittest


class RepositoryHealthTest(unittest.TestCase):
    """Verify the top-level identity. / 验证顶层项目标识。"""

    def test_readme_declares_project_name(self) -> None:
        readme = Path(__file__).resolve().parents[1] / "README.md"

        self.assertTrue(readme.is_file(), "README.md should exist / README.md 应存在")
        self.assertEqual(readme.read_text(encoding="utf-8").splitlines()[0], "# LearnLoop for DeepSeek Harness")


if __name__ == "__main__":
    unittest.main()
