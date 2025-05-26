import json
import sys
import os
import subprocess
from typing import Dict, Any


class KubernetesManager:
    """Minimal Kubernetes manager using kubectl and helm CLI."""

    def kubectl(self, args: list[str]) -> str:
        cmd = ["kubectl"] + args
        return subprocess.check_output(cmd, text=True)

    def helm(self, args: list[str]) -> str:
        cmd = ["helm"] + args
        return subprocess.check_output(cmd, text=True)

    def cleanup(self) -> None:
        # Placeholder: in full implementation we would track resources
        pass


def kubectl_get(manager: KubernetesManager, params: Dict[str, Any]) -> Dict[str, Any]:
    resource = params["resourceType"]
    name = params.get("name")
    namespace = params.get("namespace", "default")
    output = params.get("output", "json")

    args = ["get", resource]
    if name:
        args.append(name)
    if namespace and resource != "nodes":
        args += ["-n", namespace]
    args += ["-o", output]

    result = manager.kubectl(args)
    return {"content": [{"type": "text", "text": result}]} 


def kubectl_apply(manager: KubernetesManager, params: Dict[str, Any]) -> Dict[str, Any]:
    manifest = params.get("manifest")
    filename = params.get("filename")
    if not manifest and not filename:
        raise ValueError("Either manifest or filename required")

    if manifest:
        proc = subprocess.run(["kubectl", "apply", "-f", "-"], input=manifest, text=True, capture_output=True)
        result = proc.stdout
    else:
        result = manager.kubectl(["apply", "-f", filename])

    return {"content": [{"type": "text", "text": result}]}


def install_helm_chart(manager: KubernetesManager, params: Dict[str, Any]) -> Dict[str, Any]:
    name = params["name"]
    chart = params["chart"]
    namespace = params["namespace"]
    repo = params.get("repo")
    values = params.get("values")

    if repo:
        repo_name = chart.split("/")[0]
        manager.helm(["repo", "add", repo_name, repo])
        manager.helm(["repo", "update"])

    args = ["install", name, chart, "--namespace", namespace, "--create-namespace"]

    if values:
        # Write temporary values file
        values_file = f"{name}-values.yaml"
        with open(values_file, "w", encoding="utf-8") as f:
            f.write(json.dumps(values))
        args += ["-f", values_file]
        try:
            result = manager.helm(args)
        finally:
            os.remove(values_file)
    else:
        result = manager.helm(args)

    return {"content": [{"type": "text", "text": result}]}


def handle_request(manager: KubernetesManager, request: Dict[str, Any]) -> Dict[str, Any]:
    method = request.get("method")
    params = request.get("params", {})

    if method == "kubectl_get":
        return kubectl_get(manager, params)
    if method == "kubectl_apply":
        return kubectl_apply(manager, params)
    if method == "install_helm_chart":
        return install_helm_chart(manager, params)
    if method == "cleanup":
        manager.cleanup()
        return {"content": [{"type": "text", "text": json.dumps({"success": True})}]}

    raise ValueError(f"Unknown method: {method}")


def main() -> None:
    manager = KubernetesManager()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request = json.loads(line)
        try:
            response = handle_request(manager, request)
            print(json.dumps(response))
            sys.stdout.flush()
        except Exception as exc:  # pylint: disable=broad-except
            error = {"error": str(exc)}
            print(json.dumps(error))
            sys.stdout.flush()


if __name__ == "__main__":
    import sys
    main()
