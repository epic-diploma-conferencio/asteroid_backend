import ast


def _node_name(node):
    if node is None:
        return "<unknown>"
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return f"{_node_name(node.value)}.{node.attr}"
    if isinstance(node, ast.Call):
        return _node_name(node.func)
    return node.__class__.__name__


def create_analysis_envelope(metadata):
    module_id = f"module:{metadata.get('objectKey') or metadata.get('originalName') or metadata.get('hash') or 'unknown'}"
    module_name = metadata.get("originalName") or metadata.get("objectKey") or "unknown"

    return {
        "schemaVersion": "2.0.0",
        "language": "python",
        "parser": "python-ast",
        "module": {
            "id": module_id,
            "name": module_name,
            "path": module_name,
            "hash": metadata.get("hash"),
            "language": "python",
        },
        "summary": {
            "modules": 1,
            "entities": 0,
            "relations": 0,
            "imports": 0,
            "calls": 0,
            "diagnostics": 0,
        },
        "entities": [
            {
                "id": module_id,
                "kind": "module",
                "name": module_name,
                "parentId": None,
                "data": {
                    "path": module_name,
                    "hash": metadata.get("hash"),
                },
            }
        ],
        "relations": [],
        "diagnostics": [],
    }


def finalize_analysis(analysis):
    analysis["summary"] = {
        "modules": 1,
        "entities": len(analysis["entities"]),
        "relations": len(analysis["relations"]),
        "imports": len([relation for relation in analysis["relations"] if relation["kind"] == "imports"]),
        "calls": len([relation for relation in analysis["relations"] if relation["kind"] == "calls"]),
        "diagnostics": len(analysis["diagnostics"]),
    }
    return analysis


class PythonAnalyzer(ast.NodeVisitor):
    def __init__(self, metadata):
        self.analysis = create_analysis_envelope(metadata)
        self.module_id = self.analysis["module"]["id"]
        self.function_stack = []

    def _add_entity(self, entity):
        self.analysis["entities"].append(entity)

    def _add_relation(self, relation):
        self.analysis["relations"].append(relation)

    def _register_function(self, name, kind, args):
        entity_id = f"{self.module_id}:function:{name}"
        parent_id = self.function_stack[-1] if self.function_stack else self.module_id

        self._add_entity({
            "id": entity_id,
            "kind": "function",
            "name": name,
            "parentId": parent_id,
            "data": {
                "runtimeKind": kind,
                "params": args,
            },
        })

        self._add_relation({
            "id": f"{parent_id}->{entity_id}:contains",
            "from": parent_id,
            "to": entity_id,
            "kind": "contains",
            "data": {},
        })

        self.function_stack.append(entity_id)

    def visit_FunctionDef(self, node):
        self._register_function(node.name, "FunctionDef", [arg.arg for arg in node.args.args])
        self.generic_visit(node)
        self.function_stack.pop()

    def visit_AsyncFunctionDef(self, node):
        self._register_function(node.name, "AsyncFunctionDef", [arg.arg for arg in node.args.args])
        self.generic_visit(node)
        self.function_stack.pop()

    def visit_ClassDef(self, node):
        entity_id = f"{self.module_id}:class:{node.name}"
        self._add_entity({
            "id": entity_id,
            "kind": "class",
            "name": node.name,
            "parentId": self.module_id,
            "data": {
                "bases": [_node_name(base) for base in node.bases],
                "methods": [
                    child.name
                    for child in node.body
                    if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef))
                ],
            },
        })

        self._add_relation({
            "id": f"{self.module_id}->{entity_id}:contains",
            "from": self.module_id,
            "to": entity_id,
            "kind": "contains",
            "data": {},
        })

        self.generic_visit(node)

    def visit_Import(self, node):
        for alias in node.names:
            self._add_relation({
                "id": f"{self.module_id}->import:{alias.name}",
                "from": self.module_id,
                "to": f"external:{alias.name}",
                "kind": "imports",
                "data": {
                    "specifier": alias.name,
                    "bindings": [{
                        "imported": alias.name,
                        "local": alias.asname or alias.name,
                        "kind": "module",
                    }],
                },
            })

    def visit_ImportFrom(self, node):
        module_name = node.module or "<relative>"
        self._add_relation({
            "id": f"{self.module_id}->import:{module_name}",
            "from": self.module_id,
            "to": f"external:{module_name}",
            "kind": "imports",
            "data": {
                "specifier": module_name,
                "bindings": [
                    {
                        "imported": alias.name,
                        "local": alias.asname or alias.name,
                        "kind": "named",
                    }
                    for alias in node.names
                ],
            },
        })

    def visit_Assign(self, node):
        for target in node.targets:
            if isinstance(target, ast.Name):
                entity_id = f"{self.module_id}:variable:{target.id}:{node.lineno}"
                parent_id = self.function_stack[-1] if self.function_stack else self.module_id
                self._add_entity({
                    "id": entity_id,
                    "kind": "variable",
                    "name": target.id,
                    "parentId": parent_id,
                    "data": {
                        "runtimeKind": "Assign",
                    },
                })
                self._add_relation({
                    "id": f"{parent_id}->{entity_id}:contains",
                    "from": parent_id,
                    "to": entity_id,
                    "kind": "contains",
                    "data": {},
                })
        self.generic_visit(node)

    def visit_AnnAssign(self, node):
        if isinstance(node.target, ast.Name):
            entity_id = f"{self.module_id}:variable:{node.target.id}:{node.lineno}"
            parent_id = self.function_stack[-1] if self.function_stack else self.module_id
            self._add_entity({
                "id": entity_id,
                "kind": "variable",
                "name": node.target.id,
                "parentId": parent_id,
                "data": {
                    "runtimeKind": "AnnAssign",
                },
            })
            self._add_relation({
                "id": f"{parent_id}->{entity_id}:contains",
                "from": parent_id,
                "to": entity_id,
                "kind": "contains",
                "data": {},
            })
        self.generic_visit(node)

    def visit_Call(self, node):
        current_function = self.function_stack[-1] if self.function_stack else None
        if current_function:
            callee = _node_name(node.func)
            self._add_relation({
                "id": f"{current_function}->call:{callee}:{node.lineno}",
                "from": current_function,
                "to": f"call:{callee}",
                "kind": "calls",
                "data": {
                    "callee": callee,
                },
            })
        self.generic_visit(node)


def analyze_python(code, metadata=None):
    metadata = metadata or {}

    try:
        tree = ast.parse(code)
    except SyntaxError as error:
        analysis = create_analysis_envelope(metadata)
        analysis["diagnostics"] = [{
            "severity": "error",
            "message": str(error),
            "position": {
                "line": error.lineno,
                "column": error.offset,
            },
        }]
        return finalize_analysis(analysis)

    analyzer = PythonAnalyzer(metadata)
    analyzer.visit(tree)
    return finalize_analysis(analyzer.analysis)
