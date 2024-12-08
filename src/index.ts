#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as k8s from "@kubernetes/client-node";
import * as child_process from "child_process";

import {
  GetContextsSchema,
  SwitchContextSchema,
  ListResourcesSchema,
  CreatePodSchema,
  CreateDeploymentSchema,
  PortForwardSchema,
  StopPortForwardSchema,
  CleanupSchema,
  DeletePodSchema,
} from "./types.js";

// Resource tracking
interface ResourceTracker {
  kind: string;
  name: string;
  namespace: string;
  createdAt: Date;
}

interface PortForwardTracker {
  id: string;
  server: { stop: () => Promise<void> };
  resourceType: string;
  name: string;
  namespace: string;
  ports: { local: number; remote: number }[];
}

interface WatchTracker {
  id: string;
  abort: AbortController;
  resourceType: string;
  namespace: string;
}

class KubernetesManager {
  private resources: ResourceTracker[] = [];
  private portForwards: PortForwardTracker[] = [];
  private watches: WatchTracker[] = [];
  private kc: k8s.KubeConfig;
  private k8sApi: k8s.CoreV1Api;
  private k8sAppsApi: k8s.AppsV1Api;

  constructor() {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.k8sApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.k8sAppsApi = this.kc.makeApiClient(k8s.AppsV1Api);

    process.on("SIGINT", () => this.cleanup());
    process.on("SIGTERM", () => this.cleanup());
  }

  async cleanup() {
    console.log("Cleaning up resources...");

    // Stop port forwards
    for (const pf of this.portForwards) {
      try {
        await pf.server.stop();
      } catch (error) {
        console.error(`Failed to close port-forward ${pf.id}:`, error);
      }
    }

    // Stop watches
    for (const watch of this.watches) {
      watch.abort.abort();
    }

    // Delete tracked resources in reverse order
    for (const resource of [...this.resources].reverse()) {
      try {
        await this.deleteResource(
          resource.kind,
          resource.name,
          resource.namespace
        );
      } catch (error) {
        console.error(
          `Failed to delete ${resource.kind} ${resource.name}:`,
          error
        );
      }
    }
  }

  trackResource(kind: string, name: string, namespace: string) {
    this.resources.push({ kind, name, namespace, createdAt: new Date() });
  }

  async deleteResource(kind: string, name: string, namespace: string) {
    switch (kind.toLowerCase()) {
      case "pod":
        await this.k8sApi.deleteNamespacedPod(name, namespace);
        break;
      case "deployment":
        await this.k8sAppsApi.deleteNamespacedDeployment(name, namespace);
        break;
      case "service":
        await this.k8sApi.deleteNamespacedService(name, namespace);
        break;
    }
    this.resources = this.resources.filter(
      (r) => !(r.kind === kind && r.name === name && r.namespace === namespace)
    );
  }

  trackPortForward(pf: PortForwardTracker) {
    this.portForwards.push(pf);
  }

  getPortForward(id: string) {
    return this.portForwards.find((p) => p.id === id);
  }

  removePortForward(id: string) {
    this.portForwards = this.portForwards.filter((p) => p.id !== id);
  }

  trackWatch(watch: WatchTracker) {
    this.watches.push(watch);
  }

  getKubeConfig() {
    return this.kc;
  }
  getCoreApi() {
    return this.k8sApi;
  }
  getAppsApi() {
    return this.k8sAppsApi;
  }
}

const k8sManager = new KubernetesManager();

// Template configurations with health checks and resource limits
const containerTemplates: Record<string, k8s.V1Container> = {
  ubuntu: {
    name: "main",
    image: "ubuntu:latest",
    command: ["/bin/bash"],
    args: ["-c", "sleep infinity"],
    resources: {
      limits: {
        cpu: "200m",
        memory: "256Mi",
      },
      requests: {
        cpu: "100m",
        memory: "128Mi",
      },
    },
    livenessProbe: {
      exec: {
        command: ["cat", "/proc/1/status"],
      },
      initialDelaySeconds: 5,
      periodSeconds: 10,
    },
  },
  nginx: {
    name: "main",
    image: "nginx:latest",
    ports: [{ containerPort: 80 }],
    resources: {
      limits: {
        cpu: "200m",
        memory: "256Mi",
      },
      requests: {
        cpu: "100m",
        memory: "128Mi",
      },
    },
    livenessProbe: {
      httpGet: {
        path: "/",
        port: 80,
      },
      initialDelaySeconds: 5,
      periodSeconds: 10,
    },
    readinessProbe: {
      httpGet: {
        path: "/",
        port: 80,
      },
      initialDelaySeconds: 2,
      periodSeconds: 5,
    },
  },
  busybox: {
    name: "main",
    image: "busybox:latest",
    command: ["sh"],
    args: ["-c", "sleep infinity"],
    resources: {
      limits: {
        cpu: "100m",
        memory: "64Mi",
      },
      requests: {
        cpu: "50m",
        memory: "32Mi",
      },
    },
    livenessProbe: {
      exec: {
        command: ["true"],
      },
      periodSeconds: 10,
    },
  },
  alpine: {
    name: "main",
    image: "alpine:latest",
    command: ["sh"],
    args: ["-c", "sleep infinity"],
    resources: {
      limits: {
        cpu: "100m",
        memory: "64Mi",
      },
      requests: {
        cpu: "50m",
        memory: "32Mi",
      },
    },
    livenessProbe: {
      exec: {
        command: ["true"],
      },
      periodSeconds: 10,
    },
  },
};

const server = new Server(
  {
    name: "kubernetes",
    version: "0.1.0",
  },
  {
    capabilities: {},
  }
);

server.setRequestHandler<typeof GetContextsSchema>(
  GetContextsSchema,
  async (request) => {
    const kc = k8sManager.getKubeConfig();
    const contexts = kc.getContexts();
    const currentContext = kc.getCurrentContext();

    return {
      contexts: contexts.map((ctx) => ({
        name: ctx.name,
        active: ctx.name === currentContext,
      })),
    };
  }
);

server.setRequestHandler(SwitchContextSchema, async (request) => {
  try {
    const kc = k8sManager.getKubeConfig();
    kc.setCurrentContext(request.params.context);
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to switch context: ${error}`);
  }
});

server.setRequestHandler(ListResourcesSchema, async (request) => {
  try {
    const { resourceType, namespace } = request.params;
    switch (resourceType) {
      case "pod": {
        const { body } = await k8sManager
          .getCoreApi()
          .listNamespacedPod(namespace ?? "default");
        return { items: body.items };
      }
      case "deployment": {
        const { body } = await k8sManager
          .getAppsApi()
          .listNamespacedDeployment(namespace ?? "default");
        return { items: body.items };
      }
      case "service": {
        const { body } = await k8sManager
          .getCoreApi()
          .listNamespacedService(namespace ?? "default");
        return { items: body.items };
      }
      case "namespace": {
        const { body } = await k8sManager.getCoreApi().listNamespace();
        return { items: body.items };
      }
      default:
        throw new Error(`Unsupported resource type: ${resourceType}`);
    }
  } catch (error) {
    throw new Error(`Failed to list resources: ${error}`);
  }
});

server.setRequestHandler(CreatePodSchema, async (request) => {
  console.log("Creating pod inside server...");
  try {
    const { name, namespace, template, command } = request.params;
    const templateConfig = containerTemplates[template];
    const pod: k8s.V1Pod = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name,
        namespace,
        labels: {
          "mcp-managed": "true",
          app: name,
        },
      },
      spec: {
        containers: [
          {
            ...templateConfig,
            ...(command && { command }),
          },
        ],
      },
    };

    const { body } = await k8sManager
      .getCoreApi()
      .createNamespacedPod(namespace, pod);
    k8sManager.trackResource("Pod", name, namespace);
    return { podName: body.metadata!.name! };
  } catch (error) {
    throw new Error(`Failed to create pod: ${error}`);
  }
});

server.setRequestHandler(CreateDeploymentSchema, async (request) => {
  try {
    const { name, namespace, template, replicas, ports } = request.params;
    const templateConfig = containerTemplates[template];
    const deployment: k8s.V1Deployment = {
      apiVersion: "apps/v1",
      kind: "Deployment",
      metadata: {
        name,
        namespace,
        labels: {
          "mcp-managed": "true",
          app: name,
        },
      },
      spec: {
        replicas,
        selector: {
          matchLabels: {
            app: name,
          },
        },
        template: {
          metadata: {
            labels: {
              app: name,
              "mcp-managed": "true",
            },
          },
          spec: {
            containers: [
              {
                ...templateConfig,
                ...(ports && {
                  ports: ports.map((port) => ({
                    containerPort: port,
                  })),
                }),
              },
            ],
          },
        },
      },
    };

    const { body } = await k8sManager
      .getAppsApi()
      .createNamespacedDeployment(namespace, deployment);
    k8sManager.trackResource("Deployment", name, namespace);
    return { deploymentName: body.metadata!.name! };
  } catch (error) {
    throw new Error(`Failed to create deployment: ${error}`);
  }
});

// TODO: Port forwarding is not working properly just yet... unsure why
// server.setRequestHandler(PortForwardSchema, async (request) => {
//   console.error("Starting port forward...");
//   const { resourceType, name, namespace, ports } = request.params;
//   const id = `${resourceType}-${namespace}-${name}-${Date.now()}`;

//   // Start port-forward using kubectl for each port
//   const processes = ports.map(port => {
//     const child = child_process.spawn('kubectl', [
//       'port-forward',
//       '-n', namespace,
//       `${resourceType}/${name}`,
//       `${port.local}:${port.remote}`
//     ], {
//       stdio: ['ignore', 'pipe', 'pipe'],
//       detached: true // Run in background
//     });

//     // Log any errors
//     child.stderr.on('data', (data) => {
//       console.error(`Port forward ${id} stderr:`, data.toString());
//     });

//     return child;
//   });

//   // Track the port forwards
//   k8sManager.trackPortForward({
//     id,
//     server: {
//       stop: async () => {
//         // Kill all port-forward processes
//         processes.forEach(proc => {
//           if (proc.pid) {
//             try {
//               process.kill(-proc.pid); // Kill process group
//             } catch (error) {
//               console.error(`Failed to kill port-forward process:`, error);
//             }
//           }
//         });
//       }
//     },
//     resourceType,
//     name,
//     namespace,
//     ports,
//   });

//   console.log(`Port forward ${id} started`);
//   return { id, success: true };
// });

// server.setRequestHandler(StopPortForwardSchema, async (request) => {
//   try {
//     const { id } = request.params;
//     const pf = k8sManager.getPortForward(id);
//     if (pf) {
//       await pf.server.stop();
//       k8sManager.removePortForward(id);
//       return { success: true };
//     }
//     throw new Error(`Port forward ${id} not found`);
//   } catch (error) {
//     throw new Error(`Failed to stop port forward: ${error}`);
//   }
// });

server.setRequestHandler(DeletePodSchema, async (request) => {
  try {
    const { name, namespace, ignoreNotFound = false } = request.params;

    try {
      await k8sManager.getCoreApi().deleteNamespacedPod(name, namespace);
    } catch (error: any) {
      // If we're ignoring not found errors and this is a 404, succeed
      if (ignoreNotFound && error.response?.statusCode === 404) {
        return { success: true };
      }
      throw error;
    }

    return { success: true };
  } catch (error) {
    throw new Error(`Failed to delete pod: ${error}`);
  }
});

server.setRequestHandler(CleanupSchema, async () => {
  try {
    await k8sManager.cleanup();
    return { success: true };
  } catch (error) {
    throw new Error(`Failed to cleanup resources: ${error}`);
  }
});

console.log("Starting Kubernetes MCP server...");

const transport = new StdioServerTransport();
await server.connect(transport);
