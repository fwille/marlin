#!/usr/bin/env python3
"""Derive the versionCodes F-Droid actually publishes from an app.json versionCode.

The recipe's VercodeOperation turns a single app.json versionCode into one
versionCode per built ABI (e.g. 11 -> 111 armeabi-v7a, 112 arm64-v8a). Both the
new Build entries and the Fastlane changelog filenames key off those derived
values, so the arithmetic lives here rather than being duplicated in release.sh.

Usage: python3 scripts/vercodes.py <app.json versionCode>   # prints one per line
"""

import ast
import sys

import ruamel.yaml

RECIPE = 'metadata/com.marlinid.marlin.yml'


def _eval_node(node):
    """Evaluate a trivial integer arithmetic AST.

    Deliberately walks the AST by hand instead of calling eval() — VercodeOperation
    comes from a file, so it is never handed to an arbitrary-code evaluator. Only
    integer literals and + - * // % are accepted; anything else raises.
    """
    if isinstance(node, ast.Constant) and isinstance(node.value, int):
        return node.value
    if isinstance(node, ast.BinOp):
        left, right = _eval_node(node.left), _eval_node(node.right)
        ops = {
            ast.Add: lambda a, b: a + b,
            ast.Sub: lambda a, b: a - b,
            ast.Mult: lambda a, b: a * b,
            ast.FloorDiv: lambda a, b: a // b,
            ast.Mod: lambda a, b: a % b,
        }
        if type(node.op) in ops:
            return ops[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
        return -_eval_node(node.operand)
    raise ValueError(f'Unsafe expression node: {ast.dump(node)}')


def operations(path=RECIPE):
    """Read VercodeOperation from the recipe.

    Uses ruamel.yaml (YAML 1.2) rather than PyYAML for consistency with the rest
    of the tooling — PyYAML's YAML-1.1 resolver mangles the recipe's `gradle: yes`.
    Round-trip mode ('rt') resolves only plain YAML types; unlike PyYAML's
    yaml.load it has no unsafe constructors and cannot instantiate Python objects.
    """
    yaml = ruamel.yaml.YAML(typ='rt')
    with open(path) as f:
        return yaml.load(f).get('VercodeOperation', ['%c'])


def apply(operation, code):
    """Apply one VercodeOperation — always simple arithmetic like '%c * 10 + 1'."""
    expr = operation.replace('%c', str(int(code)))
    return _eval_node(ast.parse(expr, mode='eval').body)


def derive(code, ops=None):
    """All published versionCodes for a given app.json versionCode, in recipe order."""
    return [apply(op, code) for op in (operations() if ops is None else ops)]


if __name__ == '__main__':
    for derived in derive(int(sys.argv[1])):
        print(derived)
