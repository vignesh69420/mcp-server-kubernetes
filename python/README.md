# Python MCP Server for Kubernetes

This directory contains a simplified Python implementation of the MCP Kubernetes server.
The original project is written in TypeScript. The Python version is meant as a
lightweight example and only implements a subset of the features.

## Usage

The server reads JSON lines from standard input and writes JSON responses to
standard output. Each request should specify a `method` and optional `params`.

```
{"method": "kubectl_get", "params": {"resourceType": "pods"}}
```

Run the server with:

```bash
python python/server.py
```

Example using `kubectl_get`:

```
 echo '{"method": "kubectl_get", "params": {"resourceType": "pods"}}' | \
    python python/server.py
```

Only a few commands are implemented (`kubectl_get`, `kubectl_apply`,
`install_helm_chart`, `cleanup`). Additional tools from the TypeScript version
would need to be ported in a similar manner.

## Limitations

- Requires `kubectl` and `helm` to be installed and available in the PATH.
- No SSE support or advanced features from the original server.
- Error handling and resource tracking are simplified.

This stub serves as a starting point for a full Python migration.
