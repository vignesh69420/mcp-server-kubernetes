#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { listPods, listPodsSchema } from "./tools/list_pods.js";
import { listNodes, listNodesSchema } from "./tools/list_nodes.js";
import { listServices, listServicesSchema } from "./tools/list_services.js";
import {
  listDeployments,
  listDeploymentsSchema,
} from "./tools/list_deployments.js";
import { listCronJobs, listCronJobsSchema } from "./tools/list_cronjobs.js";
import {
  describeCronJob,
  describeCronJobSchema,
} from "./tools/describe_cronjob.js";
import { listJobs, listJobsSchema } from "./tools/list_jobs.js";
import { getJobLogs, getJobLogsSchema } from "./tools/get_job_logs.js";
import { describeNode, describeNodeSchema } from "./tools/describe_node.js";
import {
  installHelmChart,
  installHelmChartSchema,
  upgradeHelmChart,
  upgradeHelmChartSchema,
  uninstallHelmChart,
  uninstallHelmChartSchema,
} from "./tools/helm-operations.js";
import {
  explainResource,
  explainResourceSchema,
  listApiResources,
  listApiResourcesSchema,
} from "./tools/kubectl-operations.js";
import {
  createNamespace,
  createNamespaceSchema,
} from "./tools/create_namespace.js";
import { createPod, createPodSchema } from "./tools/create_pod.js";
import { createCronJob, createCronJobSchema } from "./tools/create_cronjob.js";
import { DeleteCronJob, DeleteCronJobSchema } from "./tools/delete_cronjob.js";
import { deletePod, deletePodSchema } from "./tools/delete_pod.js";
import { describePod, describePodSchema } from "./tools/describe_pod.js";
import { getLogs, getLogsSchema } from "./tools/get_logs.js";
import { getEvents, getEventsSchema } from "./tools/get_events.js";
import { getResourceHandlers } from "./resources/handlers.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import * as k8s from "@kubernetes/client-node";
import { KubernetesManager } from "./types.js";
import { serverConfig } from "./config/server-config.js";
import { createDeploymentSchema } from "./config/deployment-config.js";
import { listNamespacesSchema } from "./config/namespace-config.js";
import {
  deleteNamespace,
  deleteNamespaceSchema,
} from "./tools/delete_namespace.js";
import { cleanupSchema } from "./config/cleanup-config.js";
import { startSSEServer } from "./utils/sse.js";
import {
  startPortForward,
  PortForwardSchema,
  stopPortForward,
  StopPortForwardSchema,
} from "./tools/port_forward.js";
import {
  deleteDeployment,
  deleteDeploymentSchema,
} from "./tools/delete_deployment.js";
import { createDeployment } from "./tools/create_deployment.js";
import {
  scaleDeployment,
  scaleDeploymentSchema,
} from "./tools/scale_deployment.js";
import {
  describeDeployment,
  describeDeploymentSchema,
} from "./tools/describe_deployment.js";
import {
  updateDeployment,
  updateDeploymentSchema,
} from "./tools/update_deployment.js";
import {
  createConfigMap,
  CreateConfigMapSchema,
} from "./tools/create_configmap.js";
import { getConfigMap, GetConfigMapSchema } from "./tools/get_configmap.js";
import { updateConfigMap, UpdateConfigMapSchema } from "./tools/update_configmap.js";
import { deleteConfigMap, DeleteConfigMapSchema } from "./tools/delete_configmap.js";
import { listContexts, listContextsSchema } from "./tools/list_contexts.js";
import {
  getCurrentContext,
  getCurrentContextSchema,
} from "./tools/get_current_context.js";
import {
  setCurrentContext,
  setCurrentContextSchema,
} from "./tools/set_current_context.js";
import { createService, createServiceSchema } from "./tools/create_service.js";
import {
  describeService,
  describeServiceSchema,
} from "./tools/describe_service.js";
import { updateService, updateServiceSchema } from "./tools/update_service.js";
import { deleteService, deleteServiceSchema } from "./tools/delete_service.js";

const nonDestructiveTools =
  process.env.ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS === "true";

const destructiveTools = [
  deletePodSchema,
  deleteServiceSchema,
  deleteDeploymentSchema,
  deleteNamespaceSchema,
  uninstallHelmChartSchema,
  DeleteCronJobSchema,
  cleanupSchema, // Cleanup is also destructive as it deletes resources
];

const allTools = [
  cleanupSchema,
  createDeploymentSchema,
  createNamespaceSchema,
  createPodSchema,
  createCronJobSchema,
  createServiceSchema,
  deletePodSchema,
  deleteDeploymentSchema,
  deleteNamespaceSchema,
  deleteServiceSchema,
  describeCronJobSchema,
  describePodSchema,
  describeNodeSchema,
  describeDeploymentSchema,
  describeServiceSchema,
  explainResourceSchema,
  getEventsSchema,
  getJobLogsSchema,
  getLogsSchema,
  installHelmChartSchema,
  listApiResourcesSchema,
  listCronJobsSchema,
  listContextsSchema,
  getCurrentContextSchema,
  setCurrentContextSchema,
  listDeploymentsSchema,
  listJobsSchema,
  listNamespacesSchema,
  listNodesSchema,
  listPodsSchema,
  listServicesSchema,
  uninstallHelmChartSchema,
  updateDeploymentSchema,
  upgradeHelmChartSchema,
  PortForwardSchema,
  StopPortForwardSchema,
  scaleDeploymentSchema,
  DeleteCronJobSchema,
  CreateConfigMapSchema,
  updateServiceSchema,
];

const k8sManager = new KubernetesManager();

const server = new Server(
  {
    name: serverConfig.name,
    version: serverConfig.version,
  },
  serverConfig
);

// Tools handlers
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Filter out destructive tools if ALLOW_ONLY_NON_DESTRUCTIVE_TOOLS is set to 'true'
  const tools = nonDestructiveTools
    ? allTools.filter(
        (tool) => !destructiveTools.some((dt) => dt.name === tool.name)
      )
    : allTools;

  return { tools };
});

server.setRequestHandler(
  CallToolRequestSchema,
  async (request: {
    params: { name: string; _meta?: any; arguments?: Record<string, any> };
    method: string;
  }) => {
    try {
      const { name, arguments: input = {} } = request.params;

      switch (name) {
        case "cleanup": {
          await k8sManager.cleanup();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    success: true,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "create_namespace": {
          return { result: await createNamespace(
            k8sManager,
            input as {
              name: string;
            }
          ) };
        }

        case "create_pod": {
          return { result: await createPod(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              template: string;
              command?: string[];
            }
          ) };
        }

        case "create_cronjob": {
          return { result: (await createCronJob(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              schedule: string;
              image: string;
              command?: string[];
              suspend?: boolean;
            }
          )).content };
        }

        case "delete_cronjob": {
          return { result: (await DeleteCronJob(
            k8sManager,
            input as {
              name: string;
              namespace: string;
            }
          )).content };
        }
        case "delete_pod": {
          return { result: await deletePod(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              ignoreNotFound?: boolean;
            }
          ) };
        }

        case "describe_pod": {
          return { result: (await describePod(
            k8sManager,
            input as {
              name: string;
              namespace: string;
            }
          )).content };
        }

        case "describe_node": {
          return { result: (await describeNode(
            k8sManager,
            input as {
              name: string;
              namespace: string;
            }
          )).content };
        }

        case "explain_resource": {
          return { result: (await explainResource(
            input as {
              resource: string;
              apiVersion?: string;
              recursive?: boolean;
              output?: "plaintext" | "plaintext-openapiv2";
            }
          )).content };
        }

        case "get_events": {
          return { result: (await getEvents(
            k8sManager,
            input as {
              namespace?: string;
              fieldSelector?: string;
            }
          )).content };
        }

        case "get_logs": {
          return { result: (await getLogs(
            k8sManager,
            input as {
              resourceType: string;
              name?: string;
              namespace?: string;
              labelSelector?: string;
              container?: string;
              tail?: number;
              sinceSeconds?: number;
              timestamps?: boolean;
              pretty?: boolean;
              follow?: false;
            }
          )).content };
        }

        case "install_helm_chart": {
          return { result: (await installHelmChart(
            input as {
              name: string;
              chart: string;
              repo: string;
              namespace: string;
              values?: Record<string, any>;
            }
          )).content };
        }

        case "list_api_resources": {
          return { result: (await listApiResources(
            input as {
              apiGroup?: string;
              namespaced?: boolean;
              verbs?: string[];
              output?: "wide" | "name" | "no-headers";
            }
          )).content };
        }

        case "list_deployments": {
          return { result: (await listDeployments(
            k8sManager,
            input as { namespace?: string }
          )).content };
        }

        case "list_namespaces": {
          const { body } = await k8sManager.getCoreApi().listNamespace();

          const namespaces = body.items.map((ns: k8s.V1Namespace) => ({
            name: ns.metadata?.name || "",
            status: ns.status?.phase || "",
            createdAt: ns.metadata?.creationTimestamp,
          }));

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ namespaces }, null, 2),
              },
            ],
          };
        }

        case "list_nodes": {
          return { result: (await listNodes(k8sManager)).content };
        }

        case "list_pods": {
          return { result: (await listPods(k8sManager, input as { namespace?: string })).content };
        }

        case "list_services": {
          return { result: (await listServices(
            k8sManager,
            input as { namespace?: string }
          )).content };
        }

        case "list_cronjobs": {
          return { result: (await listCronJobs(
            k8sManager,
            input as { namespace?: string }
          )).content };
        }

        case "list_contexts": {
          return { result: (await listContexts(
            k8sManager,
            input as { showCurrent?: boolean }
          )).content };
        }

        case "get_current_context": {
          return { result: (await getCurrentContext(
            k8sManager,
            input as { detailed?: boolean }
          )).content };
        }

        case "set_current_context": {
          return { result: (await setCurrentContext(k8sManager, input as { name: string })).content };
        }

        case "describe_cronjob": {
          return { result: (await describeCronJob(
            k8sManager,
            input as {
              name: string;
              namespace: string;
            }
          )).content };
        }

        case "list_jobs": {
          return { result: (await listJobs(
            k8sManager,
            input as {
              namespace: string;
              cronJobName?: string;
            }
          )).content };
        }

        case "get_job_logs": {
          return { result: (await getJobLogs(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              tail?: number;
              timestamps?: boolean;
            }
          )).content };
        }

        case "uninstall_helm_chart": {
          return { result: (await uninstallHelmChart(
            input as {
              name: string;
              namespace: string;
            }
          )).content };
        }

        case "upgrade_helm_chart": {
          return { result: (await upgradeHelmChart(
            input as {
              name: string;
              chart: string;
              repo: string;
              namespace: string;
              values?: Record<string, any>;
            }
          )).content };
        }

        case "port_forward": {
          return { result: (await startPortForward(
            k8sManager,
            input as {
              resourceType: string;
              resourceName: string;
              localPort: number;
              targetPort: number;
            }
          )).content };
        }

        case "stop_port_forward": {
          return { result: (await stopPortForward(
            k8sManager,
            input as {
              id: string;
            }
          )).content };
        }

        case "delete_namespace": {
          return { result: await deleteNamespace(
            k8sManager,
            input as {
              name: string;
              ignoreNotFound?: boolean;
            }
          ) };
        }

        case "delete_deployment": {
          return { result: (await deleteDeployment(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              ignoreNotFound?: boolean;
            }
          )).content };
        }

        case "create_deployment": {
          return { result: (await createDeployment(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              template: string;
              replicas?: number;
              ports?: number[];
              customConfig?: any;
            }
          )).content };
        }
        case "update_deployment": {
          return { result: (await updateDeployment(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              template: string;
              containerName?: string;
              replicas?: number;
              customConfig?: any;
            }
          )).content };
        }
        case "describe_deployment": {
          return { result: (await describeDeployment(
            k8sManager,
            input as {
              name: string;
              namespace: string;
            }
          )).content };
        }

        case "scale_deployment": {
          return { result: (await scaleDeployment(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              replicas: number;
            }
          )).content };
        }

        case "create_configmap": {
          return { result: await createConfigMap(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              data: Record<string, string>;
            }
          ) };
        }
        case "get_configmap": {
          return { result: await getConfigMap(
            k8sManager,
            input as {
              name: string;
              namespace: string;
            }
          ) };
        }
        case "update_configmap": {
          return { result: await updateConfigMap(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              data: Record<string, string>;
            }
          ) };
        }
        case "delete_configmap": {
          return { result: await deleteConfigMap(
            k8sManager,
            input as {
              name: string;
              namespace: string;
            }
          ) };
        }

        case "create_service": {
          return { result: (await createService(
            k8sManager,
            input as {
              name: string;
              namespace?: string;
              type?: "ClusterIP" | "NodePort" | "LoadBalancer";
              selector?: Record<string, string>;
              ports: Array<{
                port: number;
                targetPort?: number;
                protocol?: string;
                name?: string;
                nodePort?: number;
              }>;
            }
          )).content };
        }

        case "update_service": {
          return { result: (await updateService(
            k8sManager,
            input as {
              name: string;
              namespace: string;
              type?: "ClusterIP" | "NodePort" | "LoadBalancer";
              selector?: Record<string, string>;
              ports?: Array<{
                port: number;
                targetPort?: number;
                protocol?: string;
                name?: string;
                nodePort?: number;
              }>;
            }
          )).content };
        }

        case "delete_service": {
          return { result: (await deleteService(
            k8sManager,
            input as {
              name: string;
              namespace?: string;
              ignoreNotFound?: boolean;
            }
          )).content };
        }

        case "describe_service": {
          return { result: (await describeService(
            k8sManager,
            input as {
              name: string;
              namespace?: string;
            }
          )).content };
        }

        default:
          throw new McpError(ErrorCode.InvalidRequest, `Unknown tool: ${name}`);
      }
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError(
        ErrorCode.InternalError,
        `Tool execution failed: ${error}`
      );
    }
  }
);

// Resources handlers
const resourceHandlers = getResourceHandlers(k8sManager);
server.setRequestHandler(
  ListResourcesRequestSchema,
  resourceHandlers.listResources
);
server.setRequestHandler(
  ReadResourceRequestSchema,
  resourceHandlers.readResource
);

if (process.env.ENABLE_UNSAFE_SSE_TRANSPORT) {
  startSSEServer(server);
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

["SIGINT", "SIGTERM"].forEach((signal) => {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down...`);
    await server.close();
    process.exit(0);
  });
});

export { allTools, destructiveTools };
