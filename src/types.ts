import { z } from "zod";

// Base schemas
export const KubeResourceType = z.enum([
  "pod",
  "deployment",
  "service",
  "namespace",
]);

export const ContainerTemplate = z.enum([
  "ubuntu",
  "nginx",
  "busybox",
  "alpine",
]);

// Request schemas
export const GetContextsSchema = z.object({
  method: z.literal("getContexts"),
  params: z.object({}).optional(),
});

export const SwitchContextSchema = z.object({
  method: z.literal("switchContext"),
  params: z.object({
    context: z.string(),
  }),
});

export const ListResourcesSchema = z.object({
  method: z.literal("listResources"),
  params: z.object({
    resourceType: KubeResourceType,
    namespace: z.string().optional(),
  }),
});

export const CreatePodSchema = z.object({
  method: z.literal("createPod"),
  params: z.object({
    name: z.string(),
    namespace: z.string(),
    template: ContainerTemplate,
    command: z.array(z.string()).optional(),
  }),
});

export const DeletePodSchema = z.object({
  method: z.literal("deletePod"),
  params: z.object({
    name: z.string(),
    namespace: z.string(),
    ignoreNotFound: z.boolean().optional(),
  }),
});

export const CreateDeploymentSchema = z.object({
  method: z.literal("createDeployment"),
  params: z.object({
    name: z.string(),
    namespace: z.string(),
    template: ContainerTemplate,
    replicas: z.number().default(1),
    ports: z.array(z.number()).optional(),
  }),
});

export const PortForwardSchema = z.object({
  method: z.literal("portForward"),
  params: z.object({
    resourceType: z.enum(["pod", "service"]),
    name: z.string(),
    namespace: z.string(),
    ports: z.array(
      z.object({
        local: z.number(),
        remote: z.number(),
      })
    ),
  }),
});

export const StopPortForwardSchema = z.object({
  method: z.literal("stopPortForward"),
  params: z.object({
    id: z.string(),
  }),
});

export const CleanupSchema = z.object({
  method: z.literal("cleanup"),
  params: z.object({}).optional(),
});

// Response schemas
export const GetContextsSchemaResponse = z.object({
  contexts: z.array(
    z.object({
      name: z.string(),
      active: z.boolean(),
    })
  ),
});

export const SwitchContextSchemaResponse = z.object({
  success: z.boolean(),
});

export const ListResourcesSchemaResponse = z.object({
  items: z.array(z.any()),
});

export const CreatePodSchemaResponse = z.object({
  podName: z.string(),
});

export const DeletePodSchemaResponse = z.object({
  success: z.boolean(),
});

export const CreateDeploymentSchemaResponse = z.object({
  deploymentName: z.string(),
});

export const PortForwardSchemaResponse = z.object({
  id: z.string(),
  success: z.boolean(),
});

export const StopPortForwardSchemaResponse = z.object({
  success: z.boolean(),
});

export const CleanupSchemaResponse = z.object({
  success: z.boolean(),
});
