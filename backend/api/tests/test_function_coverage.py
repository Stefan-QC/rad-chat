"""Bewaakt dat elke functie en methode in app/ een eigen test heeft."""

import ast
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent / "app"
TESTS_DIR = Path(__file__).resolve().parent


def collect_app_functions() -> list[tuple[str, str]]:
    """Verzamelt (module, functie) voor alle niet-dunder functies in app/."""
    found: list[tuple[str, str]] = []
    for path in sorted(APP_DIR.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                if node.name.startswith("__") and node.name.endswith("__"):
                    continue
                found.append((path.stem, node.name))
    return found


def collect_test_names() -> set[str]:
    """Verzamelt de namen van alle testfuncties in tests/."""
    names: set[str] = set()
    for path in TESTS_DIR.rglob("test_*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name.startswith("test_"):
                names.add(node.name)
    return names


def find_missing(functions: list[tuple[str, str]], test_names: set[str]) -> list[str]:
    """Geeft de functies terug waarvoor geen test met het juiste voorvoegsel bestaat."""
    missing = []
    for module, function in functions:
        prefixes = (f"test_{module}__{function}", f"test_{module}__{function.lstrip('_')}")
        if not any(name.startswith(prefixes) for name in test_names):
            missing.append(f"{module}.{function}")
    return missing


def test_function_coverage__every_function_has_a_test() -> None:
    functions = collect_app_functions()
    assert functions, "no functions found in app/"
    missing = find_missing(functions, collect_test_names())
    assert not missing, "functions without a test:\n" + "\n".join(missing)


def test_function_coverage__find_missing_reports_untested_function() -> None:
    missing = find_missing([("mod", "alpha"), ("mod", "_beta")], {"test_mod__alpha_works"})
    assert missing == ["mod._beta"]


def test_function_coverage__collect_app_functions_skips_dunders() -> None:
    names = [function for _, function in collect_app_functions()]
    assert "__init__" not in names
    assert "create_app" in names


def test_function_coverage__collect_test_names_includes_itself() -> None:
    assert "test_function_coverage__collect_test_names_includes_itself" in collect_test_names()
